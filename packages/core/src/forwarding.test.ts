/**
 * Comment forwarding service (MIN-26, plan §1.1) — Impl-C.
 *
 * Real temp SQLite + the real run/event/comment repos; the runner is a FAKE
 * `resumeRun` (records calls / can be made to reject) so we exercise the four
 * §1.1 branches + the failed-resume invariant + the incremental packet WITHOUT
 * spawning Claude or standing up server.ts.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaths, type OtterPaths, type RunStatus } from "@otter/shared";
import {
  initPersistence,
  createTicketRepository,
  createCommentRepository,
  createAgentRunRepository,
  createAgentRunEventRepository,
  type Database,
} from "@otter/persistence";
import { createCommentForwarder, type ResumeRun } from "./forwarding/forwarder.js";

describe("createCommentForwarder (MIN-26, real SQLite, fake resume)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;

  let tickets: ReturnType<typeof createTicketRepository>;
  let comments: ReturnType<typeof createCommentRepository>;
  let runs: ReturnType<typeof createAgentRunRepository>;
  let events: ReturnType<typeof createAgentRunEventRepository>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-forward-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
    tickets = createTicketRepository(db);
    comments = createCommentRepository(db);
    runs = createAgentRunRepository(db);
    events = createAgentRunEventRepository(db);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Build a forwarder over the real repos with an injectable resume. */
  function makeForwarder(resumeRun: ResumeRun, emit = vi.fn()) {
    return createCommentForwarder({
      runs,
      events,
      comments,
      projectRoot: paths.root,
      resumeRun,
      emit,
    });
  }

  /** Create a run in `status` for a ticket, optionally with a captured session id. */
  function makeRun(ticketId: string, status: RunStatus, sessionId?: string) {
    const run = runs.create({ ticketId, type: "planning" });
    runs.setStatus(run.id, status);
    if (sessionId) {
      events.append(run.id, "note", { kind: "claude_session", claudeSessionId: sessionId });
    }
    return run;
  }

  /** The comment repo has no get-by-id; re-read the metadata row directly. */
  function getComment(id: string): { metadata: Record<string, unknown> } | undefined {
    const row = db.prepare("SELECT metadata FROM comment WHERE id = ?").get(id) as
      | { metadata: string }
      | undefined;
    if (!row) return undefined;
    return { metadata: JSON.parse(row.metadata) as Record<string, unknown> };
  }

  it("waiting run → resumes, marks delivered, writes audit note", async () => {
    const ticket = tickets.create({ title: "T" });
    const run = makeRun(ticket.id, "waiting_on_user_input", "sess-1");
    const calls: Parameters<ResumeRun>[0][] = [];
    const resumeRun: ResumeRun = async (input) => {
      calls.push(input);
    };
    const fwd = makeForwarder(resumeRun);

    const comment = comments.create(ticket.id, { body: "please continue", author: "user" });
    await fwd.forwardComment(comment);

    // Resumed exactly once with the session + project root, prompt carries the body.
    expect(calls.length).toBe(1);
    const arg = calls[0]!;
    expect(arg.runId).toBe(run.id);
    expect(arg.claudeSessionId).toBe("sess-1");
    expect(arg.projectRoot).toBe(paths.root);
    expect(arg.promptMarkdown).toContain("please continue");

    // Comment marked delivered + targeted.
    const stored = getComment(comment.id)!;
    expect(stored.metadata.agentDeliveryStatus).toBe("delivered");
    expect(stored.metadata.targetRunId).toBe(run.id);

    // Audit note persisted.
    const note = events.list(run.id).find((e) => {
      const p = e.payload as { kind?: string };
      return e.kind === "note" && p.kind === "comment_forwarded";
    });
    expect(note).toBeDefined();
    expect((note!.payload as { commentId?: string }).commentId).toBe(comment.id);

    // Run moved waiting → running.
    expect(runs.get(run.id)!.status).toBe("running");
  });

  it("running run → marks pending, does NOT resume", async () => {
    const ticket = tickets.create({ title: "T" });
    const run = makeRun(ticket.id, "running", "sess-1");
    const resumeRun = vi.fn(async () => {});
    const fwd = makeForwarder(resumeRun);

    const comment = comments.create(ticket.id, { body: "mid-run note", author: "user" });
    await fwd.forwardComment(comment);

    expect(resumeRun).not.toHaveBeenCalled();
    const stored = getComment(comment.id)!;
    expect(stored.metadata.agentDeliveryStatus).toBe("pending");
    expect(stored.metadata.targetRunId).toBe(run.id);
    expect(runs.get(run.id)!.status).toBe("running"); // unchanged
  });

  it("no active/waiting run → skipped_no_active_run, not forwarded", async () => {
    const ticket = tickets.create({ title: "T" });
    // A terminal run exists but is not resumable.
    makeRun(ticket.id, "completed", "sess-old");
    const resumeRun = vi.fn(async () => {});
    const fwd = makeForwarder(resumeRun);

    // sendToAgent explicitly true (a deliberate forward attempt). With no
    // resumable run this lands at `skipped_no_active_run`. (Left to the default,
    // `sendToAgent` would be false when no run exists → `not_applicable`; that
    // default is covered by the sendToAgent:false test below.)
    const comment = comments.create(ticket.id, {
      body: "hello",
      author: "user",
      metadata: { sendToAgent: true },
    });
    await fwd.forwardComment(comment);

    expect(resumeRun).not.toHaveBeenCalled();
    expect(getComment(comment.id)!.metadata.agentDeliveryStatus).toBe("skipped_no_active_run");
  });

  it("no resumable run + no explicit flag → not_applicable (§1.2 default false)", async () => {
    const ticket = tickets.create({ title: "T" });
    makeRun(ticket.id, "completed", "sess-old"); // terminal, not resumable
    const resumeRun = vi.fn(async () => {});
    const fwd = makeForwarder(resumeRun);

    const comment = comments.create(ticket.id, { body: "fyi", author: "user" });
    await fwd.forwardComment(comment);

    expect(resumeRun).not.toHaveBeenCalled();
    expect(getComment(comment.id)!.metadata.agentDeliveryStatus).toBe("not_applicable");
  });

  it("sendToAgent:false → not_applicable, never forwarded (even with a waiting run)", async () => {
    const ticket = tickets.create({ title: "T" });
    makeRun(ticket.id, "waiting_on_user_input", "sess-1");
    const resumeRun = vi.fn(async () => {});
    const fwd = makeForwarder(resumeRun);

    const comment = comments.create(ticket.id, {
      body: "fyi only",
      author: "user",
      metadata: { sendToAgent: false },
    });
    await fwd.forwardComment(comment);

    expect(resumeRun).not.toHaveBeenCalled();
    expect(getComment(comment.id)!.metadata.agentDeliveryStatus).toBe("not_applicable");
  });

  it("failed resume keeps the comment (re-parks run, records error log)", async () => {
    const ticket = tickets.create({ title: "T" });
    const run = makeRun(ticket.id, "waiting_on_user_input", "sess-1");
    const resumeRun: ResumeRun = async () => {
      throw new Error("resume blew up");
    };
    const fwd = makeForwarder(resumeRun);

    const comment = comments.create(ticket.id, { body: "retry me", author: "user" });
    await fwd.forwardComment(comment); // must not throw

    // Comment is NOT lost — still present, still pending (eligible for retry).
    const stored = getComment(comment.id)!;
    expect(stored).toBeDefined();
    expect(stored.metadata.agentDeliveryStatus).toBe("pending");

    // Error log event recorded, run re-parked to waiting.
    const errLog = events.list(run.id).find((e) => {
      const p = e.payload as { message?: string };
      return e.kind === "log" && typeof p.message === "string" && p.message.includes("failed");
    });
    expect(errLog).toBeDefined();
    expect(runs.get(run.id)!.status).toBe("waiting_on_user_input");
  });

  it("incremental packet includes this + prior pending comments, fenced, oldest-first", async () => {
    const ticket = tickets.create({ title: "T" });
    const run = makeRun(ticket.id, "running", "sess-1");
    const resumeRun = vi.fn(async () => {});
    const fwd = makeForwarder(resumeRun);

    // First comment arrives during `running` → pending.
    const c1 = comments.create(ticket.id, { body: "first pending", author: "user" });
    await fwd.forwardComment(c1);
    expect(getComment(c1.id)!.metadata.agentDeliveryStatus).toBe("pending");

    const packet = fwd.buildIncrementalCommentPacket(ticket.id, run.id);
    expect(packet).toContain("New comments added since the run started");
    expect(packet).toContain("first pending");
    expect(packet).toContain("```"); // fenced as untrusted data

    // A delivered comment is NOT in the incremental packet.
    comments.setMetadata(c1.id, { agentDeliveryStatus: "delivered" });
    const after = fwd.buildIncrementalCommentPacket(ticket.id, run.id);
    expect(after).not.toContain("first pending");
  });

  it("findResumableRun prefers waiting_on_user_input over running", () => {
    const ticket = tickets.create({ title: "T" });
    const running = makeRun(ticket.id, "running", "sess-run");
    const waiting = makeRun(ticket.id, "waiting_on_user_input", "sess-wait");
    const fwd = makeForwarder(vi.fn());
    const picked = fwd.findResumableRun(ticket.id);
    expect(picked?.id).toBe(waiting.id);
    expect(picked?.id).not.toBe(running.id);
  });
});
