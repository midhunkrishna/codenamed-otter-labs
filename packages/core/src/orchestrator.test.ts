/**
 * Planning orchestrator tests (MIN-21 + MIN-22, plan §3) — Impl-B.
 *
 * Real temp SQLite + a real event bus, driven directly (we publish the same
 * envelopes the routes/runner would). The Claude runner and the artifact writer are
 * FAKES injected through the deps, so these tests never spawn a subprocess and never
 * import Impl-C's writer.
 *
 * Coverage:
 *  - created→plannable creates exactly ONE planning run.
 *  - a second `plannable` while one is active does NOT duplicate.
 *  - a completed planning run carrying a valid PLAN_READY → plan row created +
 *    artifact written + attention opened + ticket → needs_user_approval.
 *  - an invalid result → ticket stays plannable + a `plan_parse_error` note.
 *  - a not-ready Claude → failed run with a useful log message (no plan).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNELS, PLAN_MARKER_START, PLAN_MARKER_END, type OtterPaths } from "@otter/shared";
import { resolvePaths } from "@otter/shared";
import {
  initPersistence,
  createTicketRepository,
  createAgentRunRepository,
  createAgentRunEventRepository,
  createPlanRepository,
  createAttentionRepository,
  applyTransition,
  type Database,
} from "@otter/persistence";
import { bootstrapDefaultProject } from "./runtime/index.js";
import { createPlanningOrchestrator, type WriteArtifact } from "./runtime/orchestrator.js";
import { createEventBus, type EventBus } from "./events/bus.js";
import type { ClaudeRunner as Runner } from "./claude/types.js";

/** A planning-output blob in the OTTER_PLAN contract. */
function planBlock(header: string, body: string): string {
  return `${PLAN_MARKER_START}\n${header}\n---\n${body}\n${PLAN_MARKER_END}`;
}

describe("planning orchestrator (real SQLite + bus, fake runner/writer)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let bus: EventBus;
  let stop: () => void;
  let startPlanningRun: ReturnType<typeof vi.fn>;
  let writeArtifact: ReturnType<typeof vi.fn>;
  let runner: Runner;

  const tickets = () => createTicketRepository(db);
  const runs = () => createAgentRunRepository(db);
  const runEvents = () => createAgentRunEventRepository(db);
  const plans = () => createPlanRepository(db);
  const attention = () => createAttentionRepository(db);

  /** Move a ticket into `plannable` and publish the transition the routes would. */
  function transitionToPlannable(ticketId: string, from = "created"): void {
    applyTransition(db, { ticketId, fromStatus: from as never, toStatus: "plannable", detail: "test" });
    bus.publish(CHANNELS.project, "ticket_transitioned", { id: ticketId, from, to: "plannable" });
  }

  /** Build + start an orchestrator with a controllable Claude-readiness probe. */
  function startOrchestrator(ready = true): void {
    const orch = createPlanningOrchestrator({
      db,
      bus,
      emit: (channel, type, payload) => bus.publish(channel, type, payload),
      runner,
      projectRoot: paths.root,
      dataDir: paths.dataDir,
      writeArtifact: writeArtifact as unknown as WriteArtifact,
      isClaudeReady: async () => (ready ? { ready: true } : { ready: false, error: "no claude" }),
    });
    stop = orch.start();
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-orch-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });

    bus = createEventBus();
    startPlanningRun = vi.fn(async () => {});
    writeArtifact = vi.fn(() => ({ ok: true, relPath: "artifacts/plans/x.md", absPath: "/abs/x.md" }));
    runner = {
      startPlanningRun,
      startExecutionRun: vi.fn(async () => {}),
      resumeRun: vi.fn(async () => {}),
      cancelRun: vi.fn(async () => {}),
    } as unknown as Runner;
  });

  afterEach(async () => {
    if (stop) stop();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("created→plannable creates exactly one planning run + fires the runner", async () => {
    startOrchestrator(true);
    const ticket = tickets().create({ title: "Plan me" });
    transitionToPlannable(ticket.id);
    await vi.waitFor(() => expect(startPlanningRun).toHaveBeenCalledTimes(1));

    const planningRuns = runs().list({ ticketId: ticket.id }).filter((r) => r.type === "planning");
    expect(planningRuns).toHaveLength(1);
    expect(startPlanningRun.mock.calls[0]?.[0]).toMatchObject({ runId: planningRuns[0]?.id, projectRoot: paths.root });
  });

  it("a repeated plannable while a run is active does NOT create a duplicate", async () => {
    startOrchestrator(true);
    const ticket = tickets().create({ title: "Plan me" });
    transitionToPlannable(ticket.id);
    await vi.waitFor(() => expect(startPlanningRun).toHaveBeenCalledTimes(1));

    // Second plannable entry (e.g. a send-back) — the prior planning run is still queued.
    bus.publish(CHANNELS.project, "ticket_transitioned", { id: ticket.id, from: "needs_user_approval", to: "plannable" });
    await new Promise((r) => setTimeout(r, 20));

    expect(startPlanningRun).toHaveBeenCalledTimes(1);
    const planningRuns = runs().list({ ticketId: ticket.id }).filter((r) => r.type === "planning");
    expect(planningRuns).toHaveLength(1);
  });

  it("completed planning run with a valid PLAN_READY → plan + artifact + attention + transition", async () => {
    startOrchestrator(true);
    const ticket = tickets().create({ title: "Plan me" });
    transitionToPlannable(ticket.id);
    await vi.waitFor(() => expect(startPlanningRun).toHaveBeenCalledTimes(1));
    const run = runs().list({ ticketId: ticket.id }).find((r) => r.type === "planning")!;

    // Simulate the runner streaming a structured result, then completing.
    runEvents().append(run.id, "note", {
      kind: "structured_result",
      value: planBlock('{"status":"PLAN_READY","title":"Login feature"}', "# Login feature\n\n## Steps\n1. do it"),
    });
    runs().setStatus(run.id, "completed");
    bus.publish(CHANNELS.project, "run_status_changed", { id: run.id, runId: run.id, seq: 1 });

    await vi.waitFor(() => expect(tickets().get(ticket.id)!.status).toBe("needs_user_approval"));

    const ticketPlans = plans().listByTicket(ticket.id);
    expect(ticketPlans).toHaveLength(1);
    expect(ticketPlans[0]).toMatchObject({ title: "Login feature", status: "proposed", version: 1, runId: run.id });
    expect(ticketPlans[0]?.artifactPath).toBe("artifacts/plans/x.md");

    expect(writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "plan", name: `${ticket.id}-v1.md`, dataDir: paths.dataDir }),
    );

    const open = attention().list({ status: "open", ticketId: ticket.id });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      attentionType: "plan_approval",
      sourceType: "plan",
      sourceId: ticketPlans[0]?.id,
    });
  });

  it("completed planning run with an invalid result → ticket stays plannable + parse_error note", async () => {
    startOrchestrator(true);
    const ticket = tickets().create({ title: "Plan me" });
    transitionToPlannable(ticket.id);
    await vi.waitFor(() => expect(startPlanningRun).toHaveBeenCalledTimes(1));
    const run = runs().list({ ticketId: ticket.id }).find((r) => r.type === "planning")!;

    runEvents().append(run.id, "output_delta", { text: "I could not produce a plan." });
    runs().setStatus(run.id, "completed");
    bus.publish(CHANNELS.project, "run_status_changed", { runId: run.id, seq: 1 });

    await vi.waitFor(() => {
      const note = runEvents().list(run.id).find((e) => e.kind === "note" && e.payload.kind === "plan_parse_error");
      expect(note).toBeDefined();
      expect(typeof (note!.payload.raw as string)).toBe("string");
    });
    expect(tickets().get(ticket.id)!.status).toBe("plannable");
    expect(plans().listByTicket(ticket.id)).toHaveLength(0);
    expect(attention().list({ status: "open", ticketId: ticket.id })).toHaveLength(0);
  });

  it("missing Claude → planning run is failed with a useful log message (no plan)", async () => {
    startOrchestrator(false); // Claude not ready
    const ticket = tickets().create({ title: "Plan me" });
    transitionToPlannable(ticket.id);

    await vi.waitFor(() => {
      const run = runs().list({ ticketId: ticket.id }).find((r) => r.type === "planning");
      expect(run?.status).toBe("failed");
    });
    const run = runs().list({ ticketId: ticket.id }).find((r) => r.type === "planning")!;
    expect(startPlanningRun).not.toHaveBeenCalled();

    const log = runEvents().list(run.id).find((e) => e.kind === "log");
    expect(log).toBeDefined();
    expect(String(log!.payload.message).toLowerCase()).toContain("claude");
  });
});
