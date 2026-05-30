/**
 * Claude Code subprocess runner tests (MIN-44, Impl-B) — driven by a FAKE claude
 * binary (no real install). Mirrors runtime.test.ts: temp SQLite + a temp shell
 * script pointed at via `OTTER_CLAUDE_BIN`. Each fake emits real stream-json line
 * shapes (or misbehaves) so we can assert the runner's normalize → persist →
 * broadcast pipeline end-to-end against the live repos.
 *
 * Covered MIN-44 directives (plan §2/§4 Impl-B):
 *  - stream-json lines + exit 0 → output_delta persisted + status completed
 *  - claude.session_detected captured as a note {kind:"claude_session"}
 *  - malformed line → raw preserved (parse_warning note) + still completes
 *  - non-zero exit → run failed + a log event with the failure detail
 *  - cancel → child killed + `status_changed → canceled` recorded
 *  - resume passes `--resume <id>` (fake echoes its argv)
 *  - cwd == projectRoot (fake writes `pwd` to a file we assert on)
 *  - PERSIST-BEFORE-BROADCAST: the emit spy reads the event back via the repo and
 *    finds the row already present when it fires.
 */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaths, type OtterPaths } from "@otter/shared";
import {
  initPersistence,
  createAgentRunRepository,
  createAgentRunEventRepository,
  type Database,
  type AgentRunEventRepository,
  type AgentRunRepository,
} from "@otter/persistence";
import { createClaudeCodeSubprocessRunner, type RunnerDeps } from "./claude/runner.js";

/** Build a fake `claude` shell script with the given body; returns its path + chmod +x. */
async function writeFakeClaude(dir: string, name: string, body: string): Promise<string> {
  const bin = join(dir, name);
  await writeFile(bin, body, "utf8");
  await chmod(bin, 0o755);
  return bin;
}

/** Repos + a recording emit, wired into RunnerDeps for one project root. */
interface Harness {
  runs: AgentRunRepository;
  runEvents: AgentRunEventRepository;
  emitCalls: { channel: string; type: string; payload: Record<string, unknown> }[];
  /** For each emit, the event-rows present in the repo AT THE MOMENT emit fired. */
  emitSeenRows: Record<string, unknown>[][];
  deps: RunnerDeps;
}

describe("claude subprocess runner (fake binary, real SQLite)", () => {
  let dir: string;
  let projectRoot: string;
  let logsDir: string;
  let paths: OtterPaths;
  let db: Database.Database;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-runner-"));
    projectRoot = join(dir, "project-root");
    await mkdir(projectRoot, { recursive: true });
    logsDir = join(dir, ".otter-labs", "logs", "runs");
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeHarness(claudeBin: string): Harness {
    const runs = createAgentRunRepository(db);
    const runEvents = createAgentRunEventRepository(db);
    const emitCalls: Harness["emitCalls"] = [];
    const emitSeenRows: Harness["emitSeenRows"] = [];

    const deps: RunnerDeps = {
      append: (runId, kind, payload) => runEvents.append(runId, kind, payload),
      emit: (channel, type, payload) => {
        emitCalls.push({ channel, type, payload: payload ?? {} });
        // Persist-before-broadcast assertion seam: at the instant we broadcast,
        // the persisted row referenced by payload.id MUST already exist.
        const rows = runEvents.list(String((payload as { runId?: string })?.runId ?? ""));
        emitSeenRows.push(rows as unknown as Record<string, unknown>[]);
      },
      setRunStatus: (id, status) => runs.setStatus(id, status),
      getRun: (id) => runs.get(id),
      logsDir,
      claudeBin,
    };

    return { runs, runEvents, emitCalls, emitSeenRows, deps };
  }

  beforeEach(() => {
    // Each test makes its own fake binary; nothing global to reset here.
  });

  // ---- happy path: stream-json + exit 0 ----------------------------------

  it("emits output_delta + session note + completes on a clean stream-json run", async () => {
    const bin = await writeFakeClaude(
      dir,
      "claude-happy",
      [
        "#!/bin/sh",
        "cat > /dev/null", // drain stdin (context markdown) so we don't SIGPIPE
        `echo '{"type":"system","subtype":"init","session_id":"sess-abc"}'`,
        `echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}'`,
        `echo '{"type":"result","subtype":"success","result":"done","session_id":"sess-abc"}'`,
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    await runner.startPlanningRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    const events = h.runEvents.list(run.id);
    const kinds = events.map((e) => e.kind);
    // started → session note → output_delta → structured_result note → completed
    expect(kinds).toContain("status_changed");
    expect(kinds).toContain("output_delta");

    const delta = events.find((e) => e.kind === "output_delta");
    expect(delta?.payload.text).toBe("Hello world");

    const sessionNote = events.find(
      (e) => e.kind === "note" && e.payload.kind === "claude_session",
    );
    expect(sessionNote?.payload.claudeSessionId).toBe("sess-abc");

    const structured = events.find(
      (e) => e.kind === "note" && e.payload.kind === "structured_result",
    );
    expect(structured?.payload.value).toBe("done");

    // Run ended completed; last status_changed is → completed.
    expect(h.runs.get(run.id)?.status).toBe("completed");
    const statusChanges = events.filter((e) => e.kind === "status_changed");
    expect(statusChanges.at(-1)?.payload.to).toBe("completed");

    // A run_status_changed broadcast for completion exists on both channels.
    const completedBroadcasts = h.emitCalls.filter((c) => c.type === "run_status_changed");
    expect(completedBroadcasts.some((c) => c.channel === `run:${run.id}`)).toBe(true);
    expect(completedBroadcasts.some((c) => c.channel === "project")).toBe(true);
  });

  // ---- PERSIST BEFORE BROADCAST ------------------------------------------

  it("persists each event BEFORE it broadcasts (emit sees the row already in the repo)", async () => {
    const bin = await writeFakeClaude(
      dir,
      "claude-pbb",
      [
        "#!/bin/sh",
        "cat > /dev/null",
        `echo '{"type":"assistant","message":{"content":[{"type":"text","text":"delta-1"}]}}'`,
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    await runner.startExecutionRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    // Find the output_delta broadcast and the snapshot of repo rows at that instant.
    const idx = h.emitCalls.findIndex((c) => c.type === "run_output_delta");
    expect(idx).toBeGreaterThanOrEqual(0);
    const broadcastCall = h.emitCalls[idx];
    const seenAtBroadcast = h.emitSeenRows[idx];
    expect(broadcastCall).toBeDefined();
    expect(seenAtBroadcast).toBeDefined();
    const broadcastId = broadcastCall!.payload.id;
    expect(typeof broadcastId).toBe("string");
    // The row referenced by the broadcast id was ALREADY persisted when emit fired.
    expect(seenAtBroadcast!.some((r) => (r as { id: string }).id === broadcastId)).toBe(true);
  });

  // ---- malformed line -----------------------------------------------------

  it("preserves a malformed line as a parse_warning note and still completes", async () => {
    const bin = await writeFakeClaude(
      dir,
      "claude-malformed",
      [
        "#!/bin/sh",
        "cat > /dev/null",
        `echo 'this is not json at all {'`,
        `echo '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}'`,
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    await runner.startPlanningRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    const warning = h.runEvents
      .list(run.id)
      .find((e) => e.kind === "note" && e.payload.kind === "parse_warning");
    expect(warning).toBeDefined();
    expect(warning?.payload.raw).toBe("this is not json at all {");
    expect(h.runs.get(run.id)?.status).toBe("completed");
  });

  // ---- non-zero exit → failed --------------------------------------------

  it("marks the run failed with a log event on a non-zero exit (stderr captured)", async () => {
    const bin = await writeFakeClaude(
      dir,
      "claude-fail",
      [
        "#!/bin/sh",
        "cat > /dev/null",
        `echo 'boom on stderr' 1>&2`,
        "exit 3",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "execution" });

    await runner.startExecutionRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    expect(h.runs.get(run.id)?.status).toBe("failed");
    const events = h.runEvents.list(run.id);

    // stderr was NOT swallowed — recorded as a log {stream:"stderr"} event.
    const stderrLog = events.find((e) => e.kind === "log" && e.payload.stream === "stderr");
    expect(stderrLog).toBeDefined();
    expect(String(stderrLog?.payload.message)).toContain("boom on stderr");

    // The failure log carries the detail (exit code + stderr tail).
    const failLog = events.find(
      (e) => e.kind === "log" && typeof e.payload.message === "string" && e.payload.stream === undefined,
    );
    expect(failLog).toBeDefined();
    expect(String(failLog?.payload.message)).toMatch(/exit code 3/);
    expect(String(failLog?.payload.message)).toContain("boom on stderr");

    const lastStatus = events.filter((e) => e.kind === "status_changed").at(-1);
    expect(lastStatus?.payload.to).toBe("failed");
  });

  // ---- spawn failure (missing binary) never crashes ----------------------

  it("turns a missing claude binary into a failed run (never rejects)", async () => {
    const h = makeHarness("/no/such/otter-claude-binary");
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    // Must resolve, not reject.
    await expect(
      runner.startPlanningRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" }),
    ).resolves.toBeUndefined();
    expect(h.runs.get(run.id)?.status).toBe("failed");
  });

  // ---- cancel → child killed + canceled recorded -------------------------

  it("cancelRun kills the child and records status_changed → canceled", async () => {
    // A fake that sleeps so cancel has a live child to kill.
    const bin = await writeFakeClaude(
      dir,
      "claude-sleep",
      [
        "#!/bin/sh",
        "cat > /dev/null",
        `echo '{"type":"system","subtype":"init","session_id":"s1"}'`,
        "sleep 10",
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    const driving = runner.startPlanningRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    // Wait until the child has actually produced output (the session-init line) —
    // this proves stdout is flowing and the child's process group is established,
    // so the SIGTERM in cancelRun reaches the whole tree (the shell + its `sleep`).
    // Polling on `status==="running"` alone races ahead of the spawn (run.started
    // is recorded synchronously before the child is up).
    await vi.waitFor(
      () => {
        const hasSession = h.runEvents
          .list(run.id)
          .some((e) => e.kind === "note" && e.payload.kind === "claude_session");
        expect(hasSession).toBe(true);
      },
      { timeout: 5000 },
    );

    await runner.cancelRun(run.id);
    await driving; // the drive() promise resolves after the child is reaped

    expect(h.runs.get(run.id)?.status).toBe("canceled");
    const canceled = h.runEvents
      .list(run.id)
      .filter((e) => e.kind === "status_changed")
      .find((e) => e.payload.to === "canceled");
    expect(canceled).toBeDefined();
  });

  // ---- resume passes --resume <id> ---------------------------------------

  it("resumeRun passes --resume <claudeSessionId> in argv", async () => {
    const argvFile = join(dir, "resume-argv.txt");
    // Fake echoes its own argv to a file so we can assert the flags.
    const bin = await writeFakeClaude(
      dir,
      "claude-resume",
      [
        "#!/bin/sh",
        `echo "$@" > "${argvFile}"`,
        "cat > /dev/null",
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "execution" });

    await runner.resumeRun({
      runId: run.id,
      projectRoot,
      claudeSessionId: "resume-sess-42",
      promptMarkdown: "continue please",
    });

    const argv = await readFile(argvFile, "utf8");
    expect(argv).toContain("--resume");
    expect(argv).toContain("resume-sess-42");
    expect(argv).toContain("--output-format stream-json");
  });

  // ---- cwd == projectRoot -------------------------------------------------

  it("runs with cwd == projectRoot (fake writes pwd to stdout)", async () => {
    const bin = await writeFakeClaude(
      dir,
      "claude-pwd",
      [
        "#!/bin/sh",
        "cat > /dev/null",
        // Emit the cwd as the structured result so it lands in a note we can read.
        `echo "{\\"type\\":\\"result\\",\\"subtype\\":\\"success\\",\\"result\\":\\"$(pwd)\\"}"`,
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    await runner.startPlanningRun({ runId: run.id, projectRoot, contextMarkdown: "# ctx" });

    const structured = h.runEvents
      .list(run.id)
      .find((e) => e.kind === "note" && e.payload.kind === "structured_result");
    // macOS may resolve /var → /private/var; compare by suffix.
    expect(String(structured?.payload.value)).toContain("project-root");

    // Also assert the debug log file was written under logsDir.
    const debug = await readFile(join(logsDir, `${run.id}.log`), "utf8");
    expect(debug.length).toBeGreaterThan(0);
  });

  // ---- stdin is closed so headless claude doesn't hang -------------------

  it("writes context markdown to stdin and closes it (fake reads stdin)", async () => {
    const stdinFile = join(dir, "stdin-capture.txt");
    const bin = await writeFakeClaude(
      dir,
      "claude-stdin",
      [
        "#!/bin/sh",
        `cat > "${stdinFile}"`, // capture everything from stdin, completes on EOF
        "exit 0",
      ].join("\n"),
    );
    const h = makeHarness(bin);
    const runner = createClaudeCodeSubprocessRunner(h.deps);
    const run = h.runs.create({ type: "planning" });

    await runner.startPlanningRun({
      runId: run.id,
      projectRoot,
      contextMarkdown: "# Context payload marker\nbody",
    });

    const captured = await readFile(stdinFile, "utf8");
    expect(captured).toContain("# Context payload marker");
    expect(h.runs.get(run.id)?.status).toBe("completed");
  });
});
