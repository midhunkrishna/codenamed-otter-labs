/**
 * Plan approval + artifacts + lifecycle tests (MIN-23 / MIN-33 / D-002-1).
 *
 * Real temp SQLite (`initPersistence`) + a Fastify server via `createServer`, driven by
 * `app.inject(...)` — mirrors `routes.test.ts`. The artifact writer is exercised directly
 * (pure module) and through the Docs API.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig, resolvePaths, type OtterPaths } from "@otter/shared";
import type { Database } from "@otter/persistence";
import { createServer } from "./server.js";
import { writeArtifact } from "./artifacts/writer.js";

// Probe persistence (skip if Impl A repos aren't importable yet — the orchestrator runs full).
let persistence: typeof import("@otter/persistence") | undefined;
try {
  const mod = await import("@otter/persistence");
  persistence =
    typeof (mod as Record<string, unknown>).createPlanRepository === "function" &&
    typeof (mod as Record<string, unknown>).createAttentionRepository === "function"
      ? mod
      : undefined;
} catch {
  persistence = undefined;
}

const maybe = persistence ? describe : describe.skip;
const config = loadConfig({}, "/srv/app");

/** Walk a fresh ticket to `needs_user_approval` with a `proposed` plan; returns ids. */
function seedNeedsApproval(
  db: Database.Database,
  title: string,
): { ticketId: string; planId: string } {
  const tickets = persistence!.createTicketRepository(db);
  const plans = persistence!.createPlanRepository(db);
  const ticket = tickets.create({ title });
  tickets.setStatus(ticket.id, "needs_user_approval");
  const plan = plans.createProposed({
    ticketId: ticket.id,
    runId: null,
    title: "Plan",
    content: "# Plan\n\nbody",
  });
  return { ticketId: ticket.id, planId: plan.id };
}

describe("writeArtifact (pure, path-safe, total)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-writer-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a plan file and returns a relPath under artifacts/plans", async () => {
    const res = writeArtifact({ dataDir: dir, kind: "plan", name: "t1-v1.md", content: "# hi" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.relPath).toBe(join("artifacts", "plans", "t1-v1.md"));
    expect(await readFile(res.absPath, "utf8")).toBe("# hi");
  });

  it("rejects traversal: ../, absolute, nested — never throws", () => {
    for (const name of ["../escape.md", "/etc/passwd", "a/b.md", "..\\x.md", "..", ""]) {
      const res = writeArtifact({ dataDir: dir, kind: "plan", name, content: "x" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(typeof res.error).toBe("string");
    }
  });
});

maybe("plan approval + attention + docs (real SQLite)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-approval-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = persistence!.initPersistence(paths));
    app = await createServer(config, paths, db);
    // Docs routes are wired into the server by server.ts (Impl-B); no manual registration.
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("GET /api/tickets/:id/plans returns version DESC; 404 unknown ticket", async () => {
    const tickets = persistence!.createTicketRepository(db);
    const plans = persistence!.createPlanRepository(db);
    const t = tickets.create({ title: "Listed" });
    plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "a" });
    plans.createProposed({ ticketId: t.id, runId: null, title: "v2", content: "b" });
    const res = await app.inject({ method: "GET", url: `/api/tickets/${t.id}/plans` });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((p: { version: number }) => p.version)).toEqual([2, 1]);

    const missing = await app.inject({ method: "GET", url: "/api/tickets/nope/plans" });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /api/plans/:id returns the plan, 404 unknown", async () => {
    const { planId } = seedNeedsApproval(db, "Single plan");
    const ok = await app.inject({ method: "GET", url: `/api/plans/${planId}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().id).toBe(planId);
    const missing = await app.inject({ method: "GET", url: "/api/plans/nope" });
    expect(missing.statusCode).toBe(404);
  });

  it("approve: proposed → ticket executable, attention resolved, approvedPlanId set", async () => {
    const { ticketId, planId } = seedNeedsApproval(db, "Approve me");
    const attention = persistence!.createAttentionRepository(db);
    const item = attention.open({ ticketId, kind: "plan_approval", refId: planId });

    const res = await app.inject({ method: "POST", url: `/api/plans/${planId}/approve` });
    expect(res.statusCode).toBe(200);
    const { ticket, plan } = res.json();
    expect(ticket.status).toBe("executable");
    expect(ticket.approvedPlanId).toBe(planId);
    expect(plan.status).toBe("approved");

    // attention item resolved
    expect(attention.get(item.id)?.status).toBe("resolved");
    // ticket really moved (persisted)
    const got = await app.inject({ method: "GET", url: `/api/tickets/${ticketId}` });
    expect(got.json().status).toBe("executable");
  });

  it("approve guards: non-proposed plan / wrong ticket status → 409", async () => {
    const { planId } = seedNeedsApproval(db, "Already approved");
    await app.inject({ method: "POST", url: `/api/plans/${planId}/approve` });
    // second approve: plan no longer proposed AND ticket no longer needs_user_approval
    const again = await app.inject({ method: "POST", url: `/api/plans/${planId}/approve` });
    expect(again.statusCode).toBe(409);
    expect(typeof again.json().error).toBe("string");
  });

  it("send-back: → ticket plannable, feedback comment present, attention resolved", async () => {
    const { ticketId, planId } = seedNeedsApproval(db, "Send back");
    const attention = persistence!.createAttentionRepository(db);
    const item = attention.open({ ticketId, kind: "plan_approval", refId: planId });

    const res = await app.inject({
      method: "POST",
      url: `/api/plans/${planId}/send-back`,
      payload: { feedback: "needs more detail" },
    });
    expect(res.statusCode).toBe(200);
    const { ticket, plan } = res.json();
    expect(ticket.status).toBe("plannable");
    expect(plan.status).toBe("sent_back");

    // feedback stored as a comment authored 'user' with plan_feedback metadata
    const comments = persistence!.createCommentRepository(db).listByTicket(ticketId);
    const fb = comments.find((c) => c.body === "needs more detail");
    expect(fb).toBeTruthy();
    expect(fb?.author).toBe("user");
    expect(fb?.metadata).toMatchObject({ kind: "plan_feedback", planId });

    expect(attention.get(item.id)?.status).toBe("resolved");
  });

  it("send-back guards: empty feedback → 400", async () => {
    const { planId } = seedNeedsApproval(db, "Empty feedback");
    const res = await app.inject({
      method: "POST",
      url: `/api/plans/${planId}/send-back`,
      payload: { feedback: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("D-002-1: executable transition fails without an approved plan (generic route)", async () => {
    const tickets = persistence!.createTicketRepository(db);
    const t = tickets.create({ title: "No plan" });
    tickets.setStatus(t.id, "needs_user_approval");

    // GET transitions must NOT offer executable
    const next = await app.inject({ method: "GET", url: `/api/tickets/${t.id}/transitions` });
    expect(next.json().next).not.toContain("executable");

    // POST → executable is blocked
    const res = await app.inject({
      method: "POST",
      url: `/api/tickets/${t.id}/transitions`,
      payload: { to: "executable" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not allowed/);
  });

  it("D-002-1: executable transition allowed once a plan is approved", async () => {
    const { ticketId, planId } = seedNeedsApproval(db, "Approved then offers exec");
    // approve via repo to set approvedPlanId, then move ticket back to needs_user_approval
    // is not valid — instead just approve through the route and confirm executable offered.
    await app.inject({ method: "POST", url: `/api/plans/${planId}/approve` });
    const next = await app.inject({ method: "GET", url: `/api/tickets/${ticketId}/transitions` });
    // ticket is now executable; from executable, in_progress is plan-gated but approved → offered
    expect(next.json().current).toBe("executable");
    expect(next.json().next).toContain("in_progress");
  });

  it("GET /api/attention?status=open lists the open item (newest first)", async () => {
    const { ticketId, planId } = seedNeedsApproval(db, "Attention list");
    persistence!.createAttentionRepository(db).open({
      ticketId,
      kind: "plan_approval",
      refId: planId,
    });
    const res = await app.inject({ method: "GET", url: "/api/attention?status=open" });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i: { status: string }) => i.status === "open")).toBe(true);
    expect(items[0].ticketId).toBe(ticketId); // newest first
  });

  it("Docs: lists a written plan artifact; viewer serves content + rejects traversal", async () => {
    const w = writeArtifact({
      dataDir: paths.dataDir,
      kind: "plan",
      name: "doc-ticket-v3.md",
      content: "# Doc artifact",
    });
    expect(w.ok).toBe(true);

    const list = await app.inject({ method: "GET", url: "/api/docs/artifacts" });
    expect(list.statusCode).toBe(200);
    const found = list
      .json()
      .find((a: { name: string }) => a.name === "doc-ticket-v3.md");
    expect(found).toBeTruthy();
    expect(found.kind).toBe("plan");
    expect(found.ticketId).toBe("doc-ticket");
    expect(found.version).toBe(3);
    expect(found.size).toBeGreaterThan(0);

    const view = await app.inject({
      method: "GET",
      url: "/api/docs/artifacts/plan/doc-ticket-v3.md",
    });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toEqual({ name: "doc-ticket-v3.md", content: "# Doc artifact" });

    // traversal / unknown → 404
    const bad = await app.inject({
      method: "GET",
      url: "/api/docs/artifacts/plan/..%2f..%2fsecret.md",
    });
    expect(bad.statusCode).toBe(404);
    const missing = await app.inject({
      method: "GET",
      url: "/api/docs/artifacts/plan/nope.md",
    });
    expect(missing.statusCode).toBe(404);
  });
});
