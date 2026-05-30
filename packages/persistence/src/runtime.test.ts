import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, resolvePaths } from "@otter/shared";
import type { Database } from "./index.js";
import {
  initPersistence,
  createTicketRepository,
  createProjectRepository,
  createAgentRunRepository,
  createAgentRunEventRepository,
} from "./index.js";

let tmp: string;
let db: Database.Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-runtime-"));
  db = initPersistence(resolvePaths(tmp)).db;
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by a durability test
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("project repository", () => {
  it("getDefault returns the seeded local-project row", () => {
    const projects = createProjectRepository(db);
    const p = projects.getDefault();
    expect(p.id).toBe(DEFAULT_PROJECT_ID);
    expect(p.createdAt).toMatch(/Z$/);
    expect(p.updatedAt).toMatch(/Z$/);
  });

  it("get returns undefined for an unknown id", () => {
    const projects = createProjectRepository(db);
    expect(projects.get("nope")).toBeUndefined();
  });

  it("upsertDefault is idempotent (same id) and stores root/dataDir", async () => {
    const projects = createProjectRepository(db);
    const first = projects.upsertDefault({ name: "Otter", root: "/r1", dataDir: "/r1/.otter-labs" });
    expect(first.id).toBe(DEFAULT_PROJECT_ID);
    expect(first.name).toBe("Otter");
    expect(first.root).toBe("/r1");
    expect(first.dataDir).toBe("/r1/.otter-labs");

    await new Promise((r) => setTimeout(r, 5));
    const second = projects.upsertDefault({ name: "Otter2", root: "/r2", dataDir: "/r2/.otter-labs" });
    // Same stable id — never a new project.
    expect(second.id).toBe(DEFAULT_PROJECT_ID);
    expect(second.name).toBe("Otter2");
    expect(second.root).toBe("/r2");
    expect(second.dataDir).toBe("/r2/.otter-labs");
    expect(second.updatedAt >= first.updatedAt).toBe(true);

    // Exactly one project row exists.
    const count = (db.prepare("SELECT COUNT(*) AS n FROM project").get() as { n: number }).n;
    expect(count).toBe(1);
  });
});

describe("agent run repository", () => {
  it("create persists a queued planning run with the default project id", () => {
    const runs = createAgentRunRepository(db);
    const r = runs.create({ type: "planning" });
    expect(r.id).toBeTruthy();
    expect(r.projectId).toBe(DEFAULT_PROJECT_ID);
    expect(r.ticketId).toBeNull();
    expect(r.type).toBe("planning");
    expect(r.status).toBe("queued");
    expect(r.title).toBe("");
    expect(r.createdAt).toMatch(/Z$/);
    expect(r.startedAt).toBeNull();
    expect(r.finishedAt).toBeNull();
    expect(runs.get(r.id)).toEqual(r);
  });

  it("create links a ticket and keeps a title when provided", () => {
    const tickets = createTicketRepository(db);
    const runs = createAgentRunRepository(db);
    const t = tickets.create({ title: "T" });
    const r = runs.create({ type: "execution", ticketId: t.id, title: "exec run" });
    expect(r.ticketId).toBe(t.id);
    expect(r.title).toBe("exec run");
    expect(r.type).toBe("execution");
  });

  it("create rejects an invalid run type", () => {
    const runs = createAgentRunRepository(db);
    expect(() => runs.create({ type: "bogus" as never })).toThrow();
  });

  it("list returns runs newest-first and filters by project/ticket/status", () => {
    const tickets = createTicketRepository(db);
    const runs = createAgentRunRepository(db);
    const t = tickets.create({ title: "T" });
    const a = runs.create({ type: "planning" });
    const b = runs.create({ type: "manual", ticketId: t.id });
    const c = runs.create({ type: "review" });
    runs.setStatus(c.id, "running");

    // Newest first.
    expect(runs.list().map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    // By project.
    expect(runs.list({ projectId: DEFAULT_PROJECT_ID }).length).toBe(3);
    expect(runs.list({ projectId: "other" }).length).toBe(0);
    // By ticket.
    expect(runs.list({ ticketId: t.id }).map((r) => r.id)).toEqual([b.id]);
    // By status.
    expect(runs.list({ status: "running" }).map((r) => r.id)).toEqual([c.id]);
    expect(runs.list({ status: "queued" }).map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("setStatus sets startedAt on running and finishedAt on terminal, bumping updatedAt", async () => {
    const runs = createAgentRunRepository(db);
    const r = runs.create({ type: "planning" });
    await new Promise((res) => setTimeout(res, 5));

    const running = runs.setStatus(r.id, "running");
    expect(running?.status).toBe("running");
    expect(running?.startedAt).toMatch(/Z$/);
    expect(running?.finishedAt).toBeNull();
    expect(running!.updatedAt >= r.updatedAt).toBe(true);

    const completed = runs.setStatus(r.id, "completed");
    expect(completed?.status).toBe("completed");
    // startedAt preserved, not overwritten.
    expect(completed?.startedAt).toBe(running?.startedAt);
    expect(completed?.finishedAt).toMatch(/Z$/);
  });

  it("setStatus rejects an invalid status and returns undefined for unknown id", () => {
    const runs = createAgentRunRepository(db);
    const r = runs.create({ type: "planning" });
    expect(() => runs.setStatus(r.id, "bogus" as never)).toThrow();
    expect(runs.setStatus("nope", "running")).toBeUndefined();
  });

  it("cancel cancels a running run", () => {
    const runs = createAgentRunRepository(db);
    const r = runs.create({ type: "planning" });
    runs.setStatus(r.id, "running");
    const canceled = runs.cancel(r.id);
    expect(canceled.status).toBe("canceled");
    expect(canceled.finishedAt).toMatch(/Z$/);
  });

  it("cancel throws for a completed (terminal) run", () => {
    const runs = createAgentRunRepository(db);
    const r = runs.create({ type: "planning" });
    runs.setStatus(r.id, "running");
    runs.setStatus(r.id, "completed");
    expect(() => runs.cancel(r.id)).toThrow();
    // Still completed, untouched.
    expect(runs.get(r.id)?.status).toBe("completed");
  });

  it("cancel throws for a missing run", () => {
    const runs = createAgentRunRepository(db);
    expect(() => runs.cancel("ghost")).toThrow();
  });
});

describe("agent run event repository", () => {
  it("append assigns an incrementing per-run seq starting at 1", () => {
    const runs = createAgentRunRepository(db);
    const events = createAgentRunEventRepository(db);
    const r = runs.create({ type: "planning" });

    const e1 = events.append(r.id, "log", { msg: "start" });
    const e2 = events.append(r.id, "output_delta", { chunk: "hello" });
    const e3 = events.append(r.id, "status_changed", { to: "running" });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
    expect(e1.runId).toBe(r.id);
    expect(e2.payload).toEqual({ chunk: "hello" });
    expect(e1.createdAt).toMatch(/Z$/);
  });

  it("append defaults payload to {} and validates kind/payload", () => {
    const runs = createAgentRunRepository(db);
    const events = createAgentRunEventRepository(db);
    const r = runs.create({ type: "planning" });
    const e = events.append(r.id, "note");
    expect(e.payload).toEqual({});
    expect(() => events.append(r.id, "bogus" as never)).toThrow();
    expect(() => events.append(r.id, "log", [1, 2] as never)).toThrow();
  });

  it("seq is per-run independent", () => {
    const runs = createAgentRunRepository(db);
    const events = createAgentRunEventRepository(db);
    const r1 = runs.create({ type: "planning" });
    const r2 = runs.create({ type: "manual" });
    events.append(r1.id, "log", {});
    events.append(r1.id, "log", {});
    const e = events.append(r2.id, "log", {});
    expect(e.seq).toBe(1);
  });

  it("list returns events seq ascending", () => {
    const runs = createAgentRunRepository(db);
    const events = createAgentRunEventRepository(db);
    const r = runs.create({ type: "planning" });
    events.append(r.id, "log", { i: 1 });
    events.append(r.id, "log", { i: 2 });
    events.append(r.id, "log", { i: 3 });
    expect(events.list(r.id).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.list(r.id).map((e) => (e.payload as { i: number }).i)).toEqual([1, 2, 3]);
  });
});

describe("durability across reopen", () => {
  it("runs, events and project edits persist after closing and reopening the same file", () => {
    const paths = resolvePaths(tmp);
    const projects = createProjectRepository(db);
    const runs = createAgentRunRepository(db);
    const events = createAgentRunEventRepository(db);

    projects.upsertDefault({ name: "Persisted", root: "/p", dataDir: "/p/.otter-labs" });
    const r = runs.create({ type: "planning", title: "durable" });
    runs.setStatus(r.id, "running");
    events.append(r.id, "log", { msg: "before reopen" });

    db.close();

    // Reopen the same on-disk database (no migrations needed, already applied).
    db = initPersistence(paths).db;
    const projects2 = createProjectRepository(db);
    const runs2 = createAgentRunRepository(db);
    const events2 = createAgentRunEventRepository(db);

    const p = projects2.getDefault();
    expect(p.name).toBe("Persisted");
    expect(p.root).toBe("/p");

    const got = runs2.get(r.id);
    expect(got?.title).toBe("durable");
    expect(got?.status).toBe("running");

    const evs = events2.list(r.id);
    expect(evs.length).toBe(1);
    expect(evs[0]?.payload).toEqual({ msg: "before reopen" });
  });
});
