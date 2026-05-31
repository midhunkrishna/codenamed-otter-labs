/**
 * Attention API tests (MIN-36, plan 007 §1.4) — Impl-B.
 *
 * Real temp SQLite (`initPersistence`) + a bare Fastify app with the attention
 * routes registered against a REAL event bus we `subscribeAll` to, so we can assert
 * both the HTTP responses AND the persist-then-broadcast emits (channels
 * `attention` + `project`). Mirrors the planApproval/orchestrator harnesses.
 *
 * Coverage:
 *  - GET /api/attention with each filter (status, attention_type, project, ticket).
 *  - POST dismiss / resolve happy paths (status flips + stamps). Focus is not
 *    persisted (client-side UI state only), so there is no focus endpoint.
 *  - 404 on a missing id for every mutation.
 *  - mutations emit the right event on both channels (updated vs resolved).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolvePaths,
  CHANNELS,
  type EventEnvelope,
  type OtterPaths,
} from "@otter/shared";
import {
  initPersistence,
  createAttentionRepository,
  createTicketRepository,
  type AttentionRepository,
  type Database,
} from "@otter/persistence";
import { createEventBus, type EventBus } from "./events/bus.js";
import { registerAttentionRoutes } from "./routes/attention.js";

describe("attention API (real SQLite + bus)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let bus: EventBus;
  let events: EventEnvelope[];
  let app: FastifyInstance;
  let attention: AttentionRepository;

  /** Open a plan_approval item for a given source/ticket (canonical shape). */
  function openPlanItem(
    sourceId: string,
    overrides: Partial<{ ticketId: string; title: string; projectId: string }> = {},
  ) {
    return attention.open({
      attentionType: "plan_approval",
      sourceType: "plan",
      sourceId,
      ticketId: overrides.ticketId ?? null,
      projectId: overrides.projectId,
      priority: "high",
      title: overrides.title ?? "Plan awaiting approval",
      requiredAction: "Approve plan or send back with feedback.",
    });
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-attn-api-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
    bus = createEventBus();
    events = [];
    bus.subscribeAll((e) => events.push(e));
    attention = createAttentionRepository(db);

    app = Fastify({ logger: false });
    registerAttentionRoutes(app, db, (channel, type, payload) =>
      bus.publish(channel, type, payload),
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  // ---- GET /api/attention filters ----------------------------------------

  it("GET lists newest-first", async () => {
    openPlanItem("plan-a");
    const b = openPlanItem("plan-b");
    const res = await app.inject({ method: "GET", url: "/api/attention" });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(b.id); // newest first
  });

  it("GET filters by status", async () => {
    const a = openPlanItem("plan-a");
    openPlanItem("plan-b");
    attention.resolve(a.id);
    const open = await app.inject({ method: "GET", url: "/api/attention?status=open" });
    expect(open.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["plan-b"]);
    const resolved = await app.inject({ method: "GET", url: "/api/attention?status=resolved" });
    expect(resolved.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["plan-a"]);
  });

  it("GET filters by attention_type", async () => {
    openPlanItem("plan-a");
    attention.open({
      attentionType: "clarification_required",
      sourceType: "form",
      sourceId: "form-1",
      title: "Need info",
      requiredAction: "Answer the question.",
    });
    const plans = await app.inject({
      method: "GET",
      url: "/api/attention?attention_type=plan_approval",
    });
    expect(plans.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["plan-a"]);
    const forms = await app.inject({
      method: "GET",
      url: "/api/attention?attention_type=clarification_required",
    });
    expect(forms.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["form-1"]);
  });

  it("GET filters by project", async () => {
    openPlanItem("plan-a", { projectId: "proj-x" });
    openPlanItem("plan-b", { projectId: "proj-y" });
    const res = await app.inject({ method: "GET", url: "/api/attention?project=proj-x" });
    expect(res.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["plan-a"]);
  });

  it("GET filters by ticket", async () => {
    const tickets = createTicketRepository(db);
    const t1 = tickets.create({ title: "T1" });
    const t2 = tickets.create({ title: "T2" });
    openPlanItem("plan-a", { ticketId: t1.id });
    openPlanItem("plan-b", { ticketId: t2.id });
    const res = await app.inject({ method: "GET", url: `/api/attention?ticket=${t1.id}` });
    expect(res.json().map((i: { sourceId: string }) => i.sourceId)).toEqual(["plan-a"]);
  });

  // ---- POST mutations: happy paths ---------------------------------------

  it("POST dismiss → dismissed + dismissed_at, emits attention_item_updated on both channels", async () => {
    const item = openPlanItem("plan-a");
    const res = await app.inject({ method: "POST", url: `/api/attention/${item.id}/dismiss` });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.status).toBe("dismissed");
    expect(res.json().item.dismissedAt).not.toBeNull();
    expect(events.filter((e) => e.type === "attention_item_updated")).toHaveLength(2);
  });

  it("POST resolve → resolved + resolved_at, emits attention_item_resolved", async () => {
    const item = openPlanItem("plan-a");
    const res = await app.inject({ method: "POST", url: `/api/attention/${item.id}/resolve` });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.status).toBe("resolved");
    expect(res.json().item.resolvedAt).not.toBeNull();

    const resolved = events.filter((e) => e.type === "attention_item_resolved");
    expect(resolved.map((e) => e.channel).sort()).toEqual([CHANNELS.attention, CHANNELS.project]);
    // resolve must NOT emit an _updated event.
    expect(events.some((e) => e.type === "attention_item_updated")).toBe(false);
  });

  // ---- POST mutations: 404 on missing id ---------------------------------

  it("POST dismiss/resolve → 404 on missing id, no emit", async () => {
    for (const action of ["dismiss", "resolve"]) {
      const res = await app.inject({ method: "POST", url: `/api/attention/nope/${action}` });
      expect(res.statusCode).toBe(404);
      expect(typeof res.json().error).toBe("string");
    }
    expect(events).toHaveLength(0);
  });
});
