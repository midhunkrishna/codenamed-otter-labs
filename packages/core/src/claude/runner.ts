/**
 * Claude Code subprocess runner (MIN-44, plan §3c/§3d/§3b) — Impl-B.
 *
 * `createClaudeCodeSubprocessRunner(deps)` returns a {@link ClaudeRunner} that
 * invokes Claude Code headless (`-p --output-format stream-json --verbose`),
 * streams its stdout LINE BY LINE through the pure normalizer
 * (`parseClaudeStreamLineDetailed`), and for each normalized event PERSISTS it
 * (`deps.append`) BEFORE broadcasting it (`deps.emit`) — SQLite is the source of
 * truth (invariants §2.1/§2.2). The just-persisted `agent_run_event.id`/`seq` are
 * read back and carried in the broadcast {@link RunEventPayload} (the dedupe key).
 *
 * Hard invariants honored here (§2):
 *  - cwd is ALWAYS `projectRoot` (§2.5) — the driver never runs elsewhere.
 *  - stderr is never swallowed: tee'd to `log` run events + a per-run debug file (§2.6).
 *  - a malformed stream-json line preserves raw output via a `parse_warning` note (§2.7).
 *  - the runner NEVER rejects to the event loop: a crashing Claude becomes a `failed`
 *    run, not an unhandled rejection / server crash (§2.3). Every public method wraps
 *    its work in a try/catch and resolves.
 *  - cancellation is explicit + recorded (`status_changed → canceled`, §2.4).
 *
 * stdin: the context/prompt markdown is written to the child's stdin and stdin is
 * then ENDED — Claude Code headless blocks forever waiting for EOF otherwise.
 */
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { execa, type ResultPromise } from "execa";
import { CHANNELS } from "@otter/shared";
import type {
  AgentRun,
  AgentRunEvent,
  RunEventKind,
  RunStatus,
} from "@otter/shared";
import type { Emit } from "../events/bus.js";
import { resolveClaudeBin } from "./detect.js";
import { parseClaudeStreamLineDetailed } from "./streamParser.js";
import type { ClaudeRunEvent, ClaudeRunner } from "./types.js";

/** Collaborators the runner needs (plan §3c). The runner never touches the DB or
 * bus directly — it persists via {@link RunnerDeps.append} and broadcasts via
 * {@link RunnerDeps.emit}. */
export interface RunnerDeps {
  /** Append-and-return a persisted run event (the persist seam, §3b). */
  append: (runId: string, kind: RunEventKind, payload?: Record<string, unknown>) => AgentRunEvent;
  /** MIN-17 bus hook; called only AFTER `append` (persist-before-broadcast). */
  emit?: Emit;
  /** Set a run's status (lifecycle seam, §3b). */
  setRunStatus: (id: string, status: RunStatus) => AgentRun | undefined;
  /** Look up a run (to read the `from` status on transitions). */
  getRun: (id: string) => AgentRun | undefined;
  /** `<dataDir>/logs/runs` — per-run raw stdout/stderr debug logs land here. */
  logsDir: string;
  /** Override the claude binary; defaults to {@link resolveClaudeBin} (OTTER_CLAUDE_BIN → "claude"). */
  claudeBin?: string;
}

/** Shared shape of a planning/execution start (both pipe markdown to stdin). */
interface StartInput {
  runId: string;
  projectRoot: string;
  contextMarkdown: string;
}

/** Internal: one spawn config, common to planning/execution/resume. */
interface SpawnConfig {
  runId: string;
  projectRoot: string;
  /** Markdown piped to the child's stdin (context for start, prompt for resume). */
  stdinMarkdown: string;
  /** Extra CLI args beyond the base headless stream-json flags (e.g. `--resume <id>`). */
  extraArgs: string[];
}

/** Base headless flags for every invocation (plan §3d). */
const BASE_ARGS = ["-p", "--output-format", "stream-json", "--verbose"] as const;

export function createClaudeCodeSubprocessRunner(deps: RunnerDeps): ClaudeRunner {
  const bin = resolveClaudeBin(deps.claudeBin);
  // Track active children so cancelRun can kill the right process.
  const active = new Map<string, ResultPromise>();

  /**
   * Kill the child AND its descendants. Children are spawned `detached`, so each
   * gets its own process group whose id == the leader pid; signalling `-pid`
   * reaches the whole tree (the shell + any tool it spawned). Falls back to a
   * plain `child.kill` if the group signal fails (e.g. the leader already exited).
   */
  function killTree(child: ResultPromise, signal: NodeJS.Signals): void {
    const pid = child.pid;
    let groupKilled = false;
    if (typeof pid === "number") {
      try {
        process.kill(-pid, signal);
        groupKilled = true;
      } catch {
        // group gone / not permitted — fall through to a direct child kill.
      }
    }
    if (!groupKilled) {
      try {
        child.kill(signal);
      } catch {
        /* already exited */
      }
    }
  }

  /**
   * Persist a normalized event (BEFORE broadcast) then broadcast its identity.
   * Returns the persisted {@link AgentRunEvent} so callers can chain (e.g. read
   * back id/seq). The §3b mapping table lives here.
   */
  function persistAndBroadcast(ev: ClaudeRunEvent): void {
    switch (ev.type) {
      case "run.started": {
        const from = deps.getRun(ev.runId)?.status ?? "queued";
        deps.setRunStatus(ev.runId, "running");
        const row = deps.append(ev.runId, "status_changed", { from, to: "running" });
        broadcastStatus(row, ev.runId);
        return;
      }
      case "claude.session_detected": {
        // No broadcast — just durably record the session id for resume (MIN-21).
        deps.append(ev.runId, "note", {
          kind: "claude_session",
          claudeSessionId: ev.claudeSessionId,
        });
        return;
      }
      case "run.output.delta": {
        const row = deps.append(ev.runId, "output_delta", { text: ev.text });
        deps.emit?.(CHANNELS.run(ev.runId), "run_output_delta", {
          id: row.id,
          runId: ev.runId,
          seq: row.seq,
          text: ev.text,
        });
        return;
      }
      case "run.structured_result": {
        const row = deps.append(ev.runId, "note", {
          kind: "structured_result",
          value: ev.value,
        });
        // Optional broadcast (§3b) — surface the structured result as a delta too.
        deps.emit?.(CHANNELS.run(ev.runId), "run_output_delta", {
          id: row.id,
          runId: ev.runId,
          seq: row.seq,
        });
        return;
      }
      case "run.tool_deferred": {
        const row = deps.append(ev.runId, "permission_requested", { toolUse: ev.toolUse });
        const payload = { id: row.id, runId: ev.runId, seq: row.seq };
        deps.emit?.(CHANNELS.run(ev.runId), "permission_requested", payload);
        deps.emit?.(CHANNELS.approvals, "permission_requested", payload);
        return;
      }
      case "run.completed": {
        const from = deps.getRun(ev.runId)?.status ?? "running";
        deps.setRunStatus(ev.runId, "completed");
        const row = deps.append(ev.runId, "status_changed", { from, to: "completed" });
        broadcastStatus(row, ev.runId);
        return;
      }
      case "run.failed": {
        const from = deps.getRun(ev.runId)?.status ?? "running";
        deps.setRunStatus(ev.runId, "failed");
        const row = deps.append(ev.runId, "status_changed", { from, to: "failed" });
        // A companion `log` event carries the failure detail (code/signal + stderr tail).
        deps.append(ev.runId, "log", { message: ev.error });
        broadcastStatus(row, ev.runId);
        return;
      }
    }
  }

  /** Broadcast a status change on the per-run + project channels (after persist). */
  function broadcastStatus(row: AgentRunEvent, runId: string): void {
    const payload = { id: row.id, runId, seq: row.seq };
    deps.emit?.(CHANNELS.run(runId), "run_status_changed", payload);
    deps.emit?.(CHANNELS.project, "run_status_changed", payload);
  }

  /** Record a parse warning (raw line preserved) — no broadcast (§3b). */
  function recordParseWarning(runId: string, raw: string): void {
    deps.append(runId, "note", { kind: "parse_warning", raw });
  }

  /** Record an stderr chunk as a `log` event (stderr is never swallowed, §2.6). */
  function recordStderr(runId: string, message: string): void {
    deps.append(runId, "log", { stream: "stderr", message });
  }

  /**
   * Drive a single spawn to terminal state. NEVER rejects: any failure becomes a
   * `run.failed` event. Resolves once the child has exited and all events are
   * persisted/broadcast.
   */
  async function drive(config: SpawnConfig): Promise<void> {
    const { runId, projectRoot } = config;
    let debugLog: WriteStream | undefined;
    const stderrChunks: string[] = [];

    try {
      // run.started — set running + persist+broadcast BEFORE we spawn, so a UI
      // sees the run go live immediately.
      persistAndBroadcast({ type: "run.started", runId });

      await mkdir(deps.logsDir, { recursive: true });
      debugLog = createWriteStream(join(deps.logsDir, `${runId}.log`), { flags: "a" });

      const child = execa(bin, [...BASE_ARGS, ...config.extraArgs], {
        cwd: projectRoot, // §2.5 — driver NEVER runs outside the project root.
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        reject: false, // we inspect exitCode/signal ourselves; execa must not throw.
        // Run in its own process group so cancel can kill the WHOLE tree (the shell
        // AND any grandchildren it spawned, e.g. a long-running tool). Otherwise a
        // grandchild keeps stdout open and our line reader never sees EOF.
        detached: true,
        // A killed child should resolve, not throw — cancel handles the lifecycle.
        cleanup: true,
      });
      active.set(runId, child);

      // Write the context/prompt to stdin then END it — headless Claude blocks on EOF.
      if (child.stdin) {
        child.stdin.write(config.stdinMarkdown);
        child.stdin.end();
      }

      // Tee stderr: collect a tail for the failure message + persist + debug file.
      if (child.stderr) {
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderrChunks.push(chunk);
          debugLog?.write(`[stderr] ${chunk}`);
          recordStderr(runId, chunk);
        });
      }

      // Stream stdout line-by-line (readline handles partial-chunk boundaries).
      if (child.stdout) {
        const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
        for await (const line of rl) {
          debugLog?.write(`${line}\n`);
          const { events, parseWarning } = parseClaudeStreamLineDetailed(line, runId);
          for (const ev of events) {
            // Internal completion/failure are derived from the EXIT, not the stream,
            // so the parser never emits them — but guard defensively.
            if (ev.type === "run.completed" || ev.type === "run.failed") continue;
            persistAndBroadcast(ev);
          }
          if (parseWarning !== undefined) recordParseWarning(runId, parseWarning);
        }
      }

      const result = await child;
      active.delete(runId);

      const exitCode = result.exitCode;
      const signal = (result as { signal?: string }).signal;
      // `failed` is set by execa for ANY abnormal end (non-zero exit, signal,
      // spawn error like ENOENT). On ENOENT `exitCode` is undefined, so we must
      // NOT fall back to 0 — trust the `failed` flag as the source of truth.
      const failed = (result as { failed?: boolean }).failed === true;
      const wasCanceled = deps.getRun(runId)?.status === "canceled";

      if (wasCanceled) {
        // cancelRun already recorded the terminal `canceled` transition — done.
        return;
      }

      if (!failed && exitCode === 0 && !signal) {
        persistAndBroadcast({ type: "run.completed", runId });
      } else {
        const tail = stderrChunks.join("").trim().slice(-2000);
        const spawnError = (result as { code?: string }).code;
        const reason = signal
          ? `signal ${signal}`
          : exitCode !== undefined
            ? `exit code ${exitCode}`
            : spawnError
              ? `spawn error ${spawnError}`
              : "abnormal termination";
        const detail = [reason, tail ? `stderr: ${tail}` : undefined]
          .filter(Boolean)
          .join("; ");
        persistAndBroadcast({
          type: "run.failed",
          runId,
          error: `Claude Code run failed (${detail}).`,
        });
      }
    } catch (err) {
      // A broken Claude (spawn ENOENT, stream error, anything) must NOT crash the
      // server (§2.3). If the run is already terminal (e.g. canceled), leave it.
      active.delete(runId);
      const status = deps.getRun(runId)?.status;
      if (status !== "canceled" && status !== "failed" && status !== "completed") {
        const message = err instanceof Error ? err.message : String(err);
        try {
          persistAndBroadcast({
            type: "run.failed",
            runId,
            error: `Claude Code run could not start or crashed: ${message}`,
          });
        } catch {
          // Persistence itself failed — nothing more we can safely do; never rethrow.
        }
      }
    } finally {
      debugLog?.end();
    }
  }

  return {
    async startPlanningRun(input: StartInput): Promise<void> {
      await drive({
        runId: input.runId,
        projectRoot: input.projectRoot,
        stdinMarkdown: input.contextMarkdown,
        extraArgs: [],
      });
    },

    async startExecutionRun(input: StartInput): Promise<void> {
      await drive({
        runId: input.runId,
        projectRoot: input.projectRoot,
        stdinMarkdown: input.contextMarkdown,
        extraArgs: [],
      });
    },

    async resumeRun(input: {
      runId: string;
      projectRoot: string;
      claudeSessionId: string;
      promptMarkdown: string;
    }): Promise<void> {
      await drive({
        runId: input.runId,
        projectRoot: input.projectRoot,
        stdinMarkdown: input.promptMarkdown,
        extraArgs: ["--resume", input.claudeSessionId],
      });
    },

    async cancelRun(runId: string): Promise<void> {
      try {
        const child = active.get(runId);
        if (child) {
          // SIGTERM the whole process tree, then a SIGKILL fallback if it lingers.
          killTree(child, "SIGTERM");
          const fallback = setTimeout(() => killTree(child, "SIGKILL"), 2000);
          // Don't keep the event loop alive on the fallback timer.
          if (typeof fallback.unref === "function") fallback.unref();
        }
        // Record the explicit cancellation (§2.4) — persist before broadcast.
        const existing = deps.getRun(runId);
        const from = existing?.status ?? "running";
        // Only record if not already terminal (idempotent-ish; repo would noop too).
        deps.setRunStatus(runId, "canceled");
        const row = deps.append(runId, "status_changed", { from, to: "canceled" });
        broadcastStatus(row, runId);
        active.delete(runId);
      } catch {
        // Cancellation must never throw to the caller (the request handler).
      }
    },
  };
}
