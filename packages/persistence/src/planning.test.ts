import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths } from "@otter/shared";
import type { Database } from "./index.js";
import {
  initPersistence,
  createTicketRepository,
  createAgentRunRepository,
  createPlanRepository,
  createAttentionRepository,
} from "./index.js";

let tmp: string;
let db: Database.Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-planning-"));
  db = initPersistence(resolvePaths(tmp)).db;
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("migration 0004", () => {
  it("applies cleanly on a fresh DB (plan columns + attention_item table)", () => {
    const cols = db.prepare("PRAGMA table_info(plan)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["version", "title", "run_id", "artifact_path"]));

    const tcols = db.prepare("PRAGMA table_info(ticket)").all() as { name: string }[];
    expect(tcols.map((c) => c.name)).toContain("approved_plan_id");

    const tbl = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attention_item'")
      .get();
    expect(tbl).toBeTruthy();
  });
});

describe("plan repository", () => {
  it("createProposed starts at version 1 and increments per ticket", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });

    const p1 = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    expect(p1.version).toBe(1);
    expect(p1.status).toBe("proposed");
    expect(p1.content).toBe("c1");
    expect(p1.artifactPath).toBeNull();

    const p2 = plans.createProposed({ ticketId: t.id, runId: null, title: "v2", content: "c2" });
    expect(p2.version).toBe(2);

    // Independent per-ticket numbering.
    const t2 = tickets.create({ title: "T2" });
    const other = plans.createProposed({ ticketId: t2.id, runId: null, title: "o", content: "o" });
    expect(other.version).toBe(1);
  });

  it("listByTicket is version DESC and getLatest returns the highest version", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    plans.createProposed({ ticketId: t.id, runId: null, title: "v2", content: "c2" });
    plans.createProposed({ ticketId: t.id, runId: null, title: "v3", content: "c3" });

    expect(plans.listByTicket(t.id).map((p) => p.version)).toEqual([3, 2, 1]);
    expect(plans.getLatest(t.id)?.version).toBe(3);
  });

  it("approve sets approved and getApproved reflects it; only one approved per ticket", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    const p1 = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    const p2 = plans.createProposed({ ticketId: t.id, runId: null, title: "v2", content: "c2" });

    expect(plans.getApproved(t.id)).toBeUndefined();

    const approved1 = plans.approve(p1.id);
    expect(approved1.status).toBe("approved");
    expect(plans.getApproved(t.id)?.id).toBe(p1.id);

    // Approving a second proposed plan supersedes the prior approved one.
    const approved2 = plans.approve(p2.id);
    expect(approved2.status).toBe("approved");
    expect(plans.getApproved(t.id)?.id).toBe(p2.id);
    expect(plans.get(p1.id)?.status).toBe("superseded");

    // Still exactly one approved row.
    const count = (
      db
        .prepare("SELECT COUNT(*) AS n FROM plan WHERE ticket_id = ? AND status = 'approved'")
        .get(t.id) as { n: number }
    ).n;
    expect(count).toBe(1);
  });

  it("approve and sendBack throw unless the plan is proposed", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    const p = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    plans.approve(p.id);
    expect(() => plans.approve(p.id)).toThrow();
    expect(() => plans.sendBack(p.id)).toThrow();
    expect(() => plans.approve("ghost")).toThrow();
  });

  it("sendBack sets sent_back without approving", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    const p = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    const sent = plans.sendBack(p.id);
    expect(sent.status).toBe("sent_back");
    expect(plans.getApproved(t.id)).toBeUndefined();
  });

  it("setArtifactPath records a relative path", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    const p = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    const updated = plans.setArtifactPath(p.id, "artifacts/plans/x-v1.md");
    expect(updated.artifactPath).toBe("artifacts/plans/x-v1.md");
    expect(plans.setArtifactPath).toBeTypeOf("function");
  });
});

describe("attention repository", () => {
  it("open is idempotent per (ticket, kind)", () => {
    const tickets = createTicketRepository(db);
    const attention = createAttentionRepository(db);
    const t = tickets.create({ title: "T" });

    const a1 = attention.open({ ticketId: t.id, kind: "plan_approval", refId: "plan-1", detail: "d" });
    expect(a1.status).toBe("open");
    const a2 = attention.open({ ticketId: t.id, kind: "plan_approval", refId: "plan-2" });
    // Same open item returned; no duplicate, refId not mutated.
    expect(a2.id).toBe(a1.id);
    expect(a2.refId).toBe("plan-1");

    const openCount = (
      db.prepare("SELECT COUNT(*) AS n FROM attention_item WHERE ticket_id = ? AND status='open'").get(t.id) as {
        n: number;
      }
    ).n;
    expect(openCount).toBe(1);
  });

  it("resolve closes the item and resolveByTicketKind resolves the open one", () => {
    const tickets = createTicketRepository(db);
    const attention = createAttentionRepository(db);
    const t = tickets.create({ title: "T" });

    const a = attention.open({ ticketId: t.id, kind: "plan_approval" });
    const resolved = attention.resolve(a.id);
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toMatch(/Z$/);

    // After resolving, a fresh open is allowed (partial index only constrains open).
    const b = attention.open({ ticketId: t.id, kind: "plan_approval" });
    expect(b.id).not.toBe(a.id);

    const byKind = attention.resolveByTicketKind(t.id, "plan_approval");
    expect(byKind?.id).toBe(b.id);
    expect(byKind?.status).toBe("resolved");

    // Nothing open now.
    expect(attention.resolveByTicketKind(t.id, "plan_approval")).toBeUndefined();
  });

  it("list filters by status/ticket newest first", () => {
    const tickets = createTicketRepository(db);
    const attention = createAttentionRepository(db);
    const t1 = tickets.create({ title: "T1" });
    const t2 = tickets.create({ title: "T2" });
    const a = attention.open({ ticketId: t1.id, kind: "plan_approval" });
    const b = attention.open({ ticketId: t2.id, kind: "plan_approval" });
    attention.resolve(a.id);

    expect(attention.list({ status: "open" }).map((x) => x.id)).toEqual([b.id]);
    expect(attention.list({ ticketId: t1.id }).map((x) => x.id)).toEqual([a.id]);
  });

  it("resolve throws for an unknown id", () => {
    const attention = createAttentionRepository(db);
    expect(() => attention.resolve("ghost")).toThrow();
  });
});

describe("ticket approved-plan link", () => {
  it("setApprovedPlan round-trips and approvedPlanId maps", () => {
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const t = tickets.create({ title: "T" });
    expect(t.approvedPlanId).toBeNull();

    const p = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "c1" });
    const linked = tickets.setApprovedPlan(t.id, p.id);
    expect(linked?.approvedPlanId).toBe(p.id);
    expect(tickets.get(t.id)?.approvedPlanId).toBe(p.id);

    const cleared = tickets.setApprovedPlan(t.id, null);
    expect(cleared?.approvedPlanId).toBeNull();
    expect(tickets.setApprovedPlan("ghost", null)).toBeUndefined();
  });
});

describe("planning durability across reopen", () => {
  it("plans, attention and the approved-plan link survive a reopen", () => {
    const paths = resolvePaths(tmp);
    const tickets = createTicketRepository(db);
    const plans = createPlanRepository(db);
    const attention = createAttentionRepository(db);

    const t = tickets.create({ title: "T" });
    const p = plans.createProposed({ ticketId: t.id, runId: null, title: "v1", content: "durable" });
    plans.approve(p.id);
    tickets.setApprovedPlan(t.id, p.id);
    attention.open({ ticketId: t.id, kind: "plan_approval", refId: p.id });

    db.close();
    db = initPersistence(paths).db;

    const plans2 = createPlanRepository(db);
    const tickets2 = createTicketRepository(db);
    const attention2 = createAttentionRepository(db);
    expect(plans2.getApproved(t.id)?.content).toBe("durable");
    expect(tickets2.get(t.id)?.approvedPlanId).toBe(p.id);
    expect(attention2.list({ status: "open", ticketId: t.id }).length).toBe(1);
  });
});
