/**
 * Planning orchestrator (MIN-21 + MIN-22, plan §3) — Impl-B.
 *
 * Subscribes to the project event stream and turns a ticket entering `plannable`
 * into a Claude planning run, then turns that run's COMPLETED result into a durable
 * plan artifact + an Attention item + a `needs_user_approval` transition.
 *
 * MIN-27: a completed planning run is scanned for an `OTTER_FORM` clarification
 * block FIRST — if found, the run is parked at `waiting_on_user_input` (via the
 * injected `createForm` form service) and NO plan is produced (the user must answer
 * before planning continues). A co-emitted `OTTER_PLAN` is ignored in that case.
 *
 * Invariants honored here:
 *  - One active planning run per ticket (dedup on a non-terminal planning run).
 *  - A not-ready Claude fails the run gracefully (no doomed child), mirroring the
 *    MIN-18 start-route guard (§3e) — the MIN-21 "missing Claude" path.
 *  - Persist BEFORE every broadcast (MIN-17): rows are written, then `emit`.
 *  - Re-entrancy / idempotency is guarded by the "ticket still plannable" check +
 *    the planning-run dedup, so a duplicate `run_status_changed` is harmless.
 *
 * The orchestrator is fully dependency-injected so it can be unit-tested with a fake
 * runner + a fake `writeArtifact` + a fake `createForm` against real SQLite, WITHOUT
 * importing the real artifact writer / form service — only `server.ts` wires the
 * real ones in.
 */
import {
  CHANNELS,
  type AttentionItem,
  type Plan,
  type CreateFormInput,
  type Form,
  type Comment,
} from "@otter/shared";
import {
  createAgentRunRepository,
  createAgentRunEventRepository,
  createTicketRepository,
  createPlanRepository,
  createAttentionRepository,
  applyTransition,
  type Database,
} from "@otter/persistence";
import type { Emit } from "../events/bus.js";
import type { EventBus } from "../events/bus.js";
import type { ClaudeStatus } from "../claude/detect.js";
import { getCachedClaudeStatus } from "../claude/detect.js";
import { buildTicketContext } from "../context/packet.js";
import { parsePlanResult } from "../claude/planResult.js";
import { parseFormResult } from "../claude/formResult.js";
import type { ClaudeRunner } from "../claude/types.js";

/** Create a clarification form (the OTTER_FORM producer). `server.ts` passes
 * `formService.createForm`; tests pass a fake. */
type CreateForm = (ticketId: string, input: CreateFormInput) => { form: Form; comment: Comment };

/**
 * Structural type of the artifact writer (§2.5). Declared locally so the
 * orchestrator does not import Impl-C's module — `server.ts` passes the real
 * `writeArtifact`, tests pass a fake.
 */
export type WriteArtifact = (input: {
  dataDir: string;
  kind: "plan";
  name: string;
  content: string;
}) =>
  | { ok: true; relPath: string; absPath: string }
  | { ok: false; error: string };

/** Collaborators the orchestrator needs (plan §3). All injected for testability. */
export interface PlanningOrchestratorDeps {
  db: Database.Database;
  /** The bus to subscribe to `CHANNELS.project` on. */
  bus: EventBus;
  /** Publish hook — broadcasts AFTER persistence (persist-before-broadcast). */
  emit: Emit;
  /** The (sub)process runner that actually drives Claude. Tests inject a fake. */
  runner: ClaudeRunner;
  /** Absolute project root — the driver's cwd. */
  projectRoot: string;
  /** Absolute data dir — plan artifacts are written under it. */
  dataDir: string;
  /** Writes a plan artifact to disk (§2.5). Injected so we never import the real writer. */
  writeArtifact: WriteArtifact;
  /** Claude readiness probe; defaults to the cached boot probe. */
  isClaudeReady?: () => Promise<ClaudeStatus>;
  /** MIN-27: create a clarification form (the OTTER_FORM producer). Injected;
   * tests pass a fake. `server.ts` passes `formService.createForm`. */
  createForm?: CreateForm;
}

/** The orchestrator surface: `start()` subscribes and returns an unsubscribe fn. */
export interface PlanningOrchestrator {
  start(): () => void;
}

export function createPlanningOrchestrator(deps: PlanningOrchestratorDeps): PlanningOrchestrator {
  const runs = createAgentRunRepository(deps.db);
  const runEvents = createAgentRunEventRepository(deps.db);
  const tickets = createTicketRepository(deps.db);
  const plans = createPlanRepository(deps.db);
  const attention = createAttentionRepository(deps.db);
  const isClaudeReady = deps.isClaudeReady ?? getCachedClaudeStatus;

  /** Is there a non-terminal planning run for this ticket already? (dedup, §3) */
  function hasActivePlanningRun(ticketId: string): boolean {
    return runs
      .list({ ticketId })
      .some(
        (r) =>
          r.type === "planning" &&
          r.status !== "completed" &&
          r.status !== "failed" &&
          r.status !== "canceled",
      );
  }

  /** Broadcast a ticket transition on the ticket + project channels (after persist). */
  function emitTransition(ticketId: string, from: string, to: string): void {
    const payload = { id: ticketId, from, to };
    deps.emit(CHANNELS.ticket(ticketId), "ticket_transitioned", payload);
    deps.emit(CHANNELS.project, "ticket_transitioned", payload);
  }

  /** Broadcast a run-created event on the project + per-run channels (after persist). */
  function emitRunCreated(runId: string, ticketId: string): void {
    const payload = { id: runId, status: "queued", type: "planning", ticketId };
    deps.emit(CHANNELS.project, "run_created", payload);
    deps.emit(CHANNELS.run(runId), "run_created", payload);
  }

  /** Broadcast an attention-item-created event on the attention + project channels. */
  function emitAttentionCreated(item: AttentionItem): void {
    const payload = {
      id: item.id,
      ticketId: item.ticketId,
      attentionType: item.attentionType,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
    };
    deps.emit(CHANNELS.attention, "attention_item_created", payload);
    deps.emit(CHANNELS.project, "attention_item_created", payload);
  }

  /** MIN-21: a ticket entered `plannable` → start a planning run (if none active). */
  async function maybeStartPlanningRun(ticketId: string): Promise<void> {
    const ticket = tickets.get(ticketId);
    if (!ticket || ticket.status !== "plannable") return;
    if (hasActivePlanningRun(ticketId)) return; // one active planning run per ticket.

    const run = runs.create({ type: "planning", ticketId, title: `Planning ${ticketId}` });

    // Claude-readiness guard (mirrors routes.ts §3e): a not-ready Claude fails the
    // run gracefully with an actionable log, rather than spawning a doomed child.
    const claude = await isClaudeReady();
    if (!claude.ready) {
      const failed = runs.setStatus(run.id, "failed") ?? run;
      runEvents.append(run.id, "status_changed", { from: "queued", to: "failed" });
      runEvents.append(run.id, "log", {
        message:
          `Claude Code is not ready, so this planning run cannot start. ` +
          `${claude.error ?? "Run `claude --version` to verify the install."} ` +
          `Once Claude is available, move the ticket back to plannable to re-plan.`,
      });
      emitRunCreated(run.id, ticketId);
      deps.emit(CHANNELS.project, "run_status_changed", {
        id: failed.id,
        status: failed.status,
        type: failed.type,
        ticketId: failed.ticketId,
      });
      return;
    }

    emitRunCreated(run.id, ticketId);

    const contextMarkdown = buildTicketContext(deps.db, ticketId, {
      mode: "planning",
      projectRoot: deps.projectRoot,
    });
    // Fire-and-forget: the runner drives to terminal + streams events. It never
    // rejects (§2.3), but guard the kickoff so a synchronous throw can't escape.
    try {
      void deps.runner.startPlanningRun({ runId: run.id, projectRoot: deps.projectRoot, contextMarkdown });
    } catch {
      runs.setStatus(run.id, "failed");
      runEvents.append(run.id, "status_changed", { from: "queued", to: "failed" });
      runEvents.append(run.id, "log", { message: "Failed to start the Claude planning run." });
    }
  }

  /**
   * Concatenate the run's `structured_result` note value + all `output_delta` text,
   * newest context last — the text fed to {@link parsePlanResult} / {@link parseFormResult}.
   */
  function collectResultText(runId: string): string {
    const events = runEvents.list(runId); // seq asc
    const parts: string[] = [];
    for (const ev of events) {
      if (ev.kind === "note" && ev.payload.kind === "structured_result") {
        const value = ev.payload.value;
        parts.push(typeof value === "string" ? value : JSON.stringify(value ?? ""));
      } else if (ev.kind === "output_delta") {
        const text = ev.payload.text;
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join("\n");
  }

  /** MIN-22/27: a planning run completed → either ask a clarification form, or
   * parse + materialize the plan (or record why not). */
  function processPlanningResult(runId: string, ticketId: string): void {
    const text = collectResultText(runId);

    // MIN-27: scan for an OTTER_FORM clarification block FIRST. A planning run that
    // asks the user parks at `waiting_on_user_input` (the form service re-parks the
    // run, opens a `clarification_required` attention item, and sets the ticket
    // block) and produces NO plan — a co-emitted OTTER_PLAN is ignored (questions
    // outrank a guess). The orchestrator just re-broadcasts the parked run status.
    const formResult = parseFormResult(text);
    if (formResult.found && formResult.form && deps.createForm) {
      deps.createForm(ticketId, { ...formResult.form, runId });
      const parked = runs.get(runId);
      if (parked) {
        deps.emit(CHANNELS.project, "run_status_changed", {
          id: parked.id,
          runId: parked.id,
          status: parked.status,
          type: parked.type,
          ticketId: parked.ticketId,
        });
      }
      return; // do NOT run the plan path.
    }

    const result = parsePlanResult(text);

    if (result.kind === "blocked") {
      runEvents.append(runId, "note", { kind: "plan_blocked", reason: result.reason });
      return; // ticket stays plannable; no artifact, no attention.
    }
    if (result.kind === "error") {
      runEvents.append(runId, "note", { kind: "plan_parse_error", raw: result.raw });
      return; // ticket stays plannable; raw Claude output preserved.
    }

    // ready → create the proposed plan, write the artifact, open attention, transition.
    const plan: Plan = plans.createProposed({
      ticketId,
      runId,
      title: result.title,
      content: result.markdown,
    });

    const written = deps.writeArtifact({
      dataDir: deps.dataDir,
      kind: "plan",
      name: `${ticketId}-v${plan.version}.md`,
      content: result.markdown,
    });
    if (written.ok) {
      plans.setArtifactPath(plan.id, written.relPath);
    } else {
      // Non-fatal: the plan still exists in SQLite; record why the file is missing.
      runEvents.append(runId, "log", { message: `Plan artifact not written: ${written.error}` });
    }

    // Attention item (idempotent per source+type) — persist before broadcast.
    const item = attention.open({
      attentionType: "plan_approval",
      sourceType: "plan",
      sourceId: plan.id,
      ticketId,
      priority: "high",
      title: `Plan v${plan.version} awaiting approval`,
      summary: result.title || "A plan is ready for your decision.",
      requiredAction: "Approve plan or send back with feedback.",
    });
    emitAttentionCreated(item);

    // Transition plannable → needs_user_approval — only if the ticket is still plannable.
    const current = tickets.get(ticketId);
    if (current && current.status === "plannable") {
      applyTransition(deps.db, {
        ticketId,
        fromStatus: "plannable",
        toStatus: "needs_user_approval",
        detail: `Plan v${plan.version} proposed (run ${runId}).`,
      });
      emitTransition(ticketId, "plannable", "needs_user_approval");
    }
  }

  /** A `run_status_changed` envelope: resolve the run, act only on completed planning. */
  function onRunStatusChanged(payload: Record<string, unknown>): void {
    const runId =
      (typeof payload.runId === "string" && payload.runId) ||
      (typeof payload.id === "string" && payload.id) ||
      undefined;
    if (!runId) return;
    // Read authoritative status/type/ticket from the DB (the payload shape varies).
    const run = runs.get(runId);
    if (!run || run.type !== "planning" || run.status !== "completed") return;
    if (run.ticketId === null) return;
    processPlanningResult(runId, run.ticketId);
  }

  return {
    start(): () => void {
      const unsubscribe = deps.bus.subscribe(CHANNELS.project, (envelope) => {
        if (envelope.type === "ticket_transitioned") {
          const to = envelope.payload.to;
          const ticketId = envelope.payload.id;
          if (to === "plannable" && typeof ticketId === "string") {
            // Fire-and-forget: the readiness probe is async; subscriber must not block.
            void maybeStartPlanningRun(ticketId);
          }
        } else if (envelope.type === "run_status_changed") {
          onRunStatusChanged(envelope.payload);
        }
      });
      return unsubscribe;
    },
  };
}
