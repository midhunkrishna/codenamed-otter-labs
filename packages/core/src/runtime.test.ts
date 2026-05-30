/**
 * Runtime API tests (Impl-C — MIN-19 runs API + MIN-18 guard + MIN-45 project).
 *
 * Against REAL temp SQLite (mirrors routes.test.ts bootstrap): builds a bare
 * Fastify app, runs `bootstrapDefaultProject` + `registerRuntimeRoutes(app, db,
 * spyEmit)`, and drives it with `app.inject(...)`.
 *
 * Claude readiness is controlled WITHOUT a real install: a fake `claude` script is
 * written to a temp dir and `OTTER_CLAUDE_BIN` is pointed at it (ready) or at a
 * non-existent path (not ready); the cached boot probe is reset between cases.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaths, DEFAULT_PROJECT_ID, type OtterPaths } from "@otter/shared";
import type { Database } from "@otter/persistence";
import {
  initPersistence,
  createAgentRunEventRepository,
  createTicketRepository,
} from "@otter/persistence";
import {
  registerRuntimeRoutes,
  bootstrapDefaultProject,
} from "./runtime/index.js";
import { resetClaudeStatusCache } from "./claude/detect.js";

type Emit = (channel: string, type: string, payload?: Record<string, unknown>) => void;

async function buildApp(db: Database.Database, emit: Emit): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRuntimeRoutes(app, db, emit as never);
  await app.ready();
  return app;
}

describe("runtime API (real SQLite)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let app: FastifyInstance;
  let emit: ReturnType<typeof vi.fn>;

  let readyBin: string;
  const missingBin = "/no/such/otter-claude";
  let prevEnv: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-runtime-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));

    readyBin = join(dir, "claude");
    await writeFile(readyBin, '#!/bin/sh\necho "9.9.9 (Claude Code)"\n', "utf8");
    await chmod(readyBin, 0o755);

    prevEnv = process.env.OTTER_CLAUDE_BIN;
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prevEnv === undefined) delete process.env.OTTER_CLAUDE_BIN;
    else process.env.OTTER_CLAUDE_BIN = prevEnv;
    await rm(dir, { recursive: true, force: true });
  });

  /** Rebuild the app with Claude either ready or missing, fresh probe cache + spy. */
  async function withClaude(ready: boolean): Promise<void> {
    if (app) await app.close();
    process.env.OTTER_CLAUDE_BIN = ready ? readyBin : missingBin;
    resetClaudeStatusCache();
    emit = vi.fn();
    app = await buildApp(db, emit as unknown as Emit);
  }

  beforeEach(async () => {
    await withClaude(true);
  });

  // ---- MIN-19 happy path -------------------------------------------------

  it("POST /api/runs creates a planning run (uses default project id), 201 + run_created emitted", async () => {
    const res = await app.inject({ method: "POST", url: "/api/runs", payload: { type: "planning", title: "Plan it" } });
    expect(res.statusCode).toBe(201);
    const run = res.json();
    expect(run.id).toBeTruthy();
    expect(run.type).toBe("planning");
    expect(run.status).toBe("queued");
    expect(run.projectId).toBe(DEFAULT_PROJECT_ID);
    expect(run.ticketId).toBeNull();

    // run_created broadcast on project + run:<id> channels, AFTER persist.
    const created = emit.mock.calls.filter((c) => c[1] === "run_created");
    expect(created.length).toBe(2);
    expect(created.map((c) => c[0]).sort()).toEqual(["project", `run:${run.id}`].sort());
  });

  it("POST /api/runs rejects an invalid type with 400 {error}", async () => {
    const res = await app.inject({ method: "POST", url: "/api/runs", payload: { type: "bogus" } });
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe("string");
  });

  it("manual run is created queued even when Claude is missing (no guard)", async () => {
    await withClaude(false);
    const res = await app.inject({ method: "POST", url: "/api/runs", payload: { type: "manual" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("queued");
  });

  it("GET /api/runs/:id returns the run, 404 for unknown", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/runs", payload: { type: "manual" } })).json();
    const ok = await app.inject({ method: "GET", url: `/api/runs/${created.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().id).toBe(created.id);
    const missing = await app.inject({ method: "GET", url: "/api/runs/does-not-exist" });
    expect(missing.statusCode).toBe(404);
  });

  it("appends a run event and GET /api/runs/:id/events returns it seq asc (404 unknown)", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/runs", payload: { type: "manual" } })).json();
    const runEvents = createAgentRunEventRepository(db);
    runEvents.append(created.id, "output_delta", { text: "hello" });
    runEvents.append(created.id, "note", { text: "world" });
    const res = await app.inject({ method: "GET", url: `/api/runs/${created.id}/events` });
    expect(res.statusCode).toBe(200);
    const events = res.json();
    expect(events.map((e: { seq: number }) => e.seq)).toEqual([1, 2]);
    const missing = await app.inject({ method: "GET", url: "/api/runs/nope/events" });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /api/runs lists newest-first and filters by project/ticket/status", async () => {
    // Use a REAL ticket so the ticket filter actually exercises non-empty data
    // (a non-existent ticketId now 404s — see the FK-guard test below).
    const ticket = createTicketRepository(db).create({ title: "filter ticket" });
    const createRes = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { type: "manual", ticketId: ticket.id },
    });
    expect(createRes.statusCode).toBe(201);

    const byProject = await app.inject({ method: "GET", url: `/api/runs?projectId=${DEFAULT_PROJECT_ID}` });
    expect(byProject.statusCode).toBe(200);
    expect(Array.isArray(byProject.json())).toBe(true);
    expect(byProject.json().length).toBeGreaterThan(0);

    const byTicket = await app.inject({ method: "GET", url: `/api/runs?ticketId=${ticket.id}` });
    expect(byTicket.json().length).toBeGreaterThan(0); // not vacuous
    expect(byTicket.json().every((r: { ticketId: string }) => r.ticketId === ticket.id)).toBe(true);

    const byStatus = await app.inject({ method: "GET", url: "/api/runs?status=queued" });
    expect(byStatus.json().every((r: { status: string }) => r.status === "queued")).toBe(true);

    const badStatus = await app.inject({ method: "GET", url: "/api/runs?status=bogus" });
    expect(badStatus.statusCode).toBe(400);
  });

  it("POST /api/runs with an unknown ticketId returns 404 {error} (not a raw 500 FK)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { type: "manual", ticketId: "ghost-ticket" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/ticket not found/i);
  });

  it("POST /api/runs treats an empty-string ticketId as a non-ticket run (201, ticketId null)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { type: "manual", ticketId: "   " },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ticketId).toBeNull();
  });

  // ---- MIN-19 cancel ------------------------------------------------------

  it("cancels a running run; emits run_status_changed; completed run cannot be canceled (409)", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/runs", payload: { type: "manual" } })).json();
    const cancel = await app.inject({ method: "POST", url: `/api/runs/${created.id}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("canceled");
    expect(emit.mock.calls.some((c) => c[1] === "run_status_changed")).toBe(true);

    // Cancel again → already terminal → 409.
    const again = await app.inject({ method: "POST", url: `/api/runs/${created.id}/cancel` });
    expect(again.statusCode).toBe(409);
    expect(typeof again.json().error).toBe("string");

    // Unknown run → 404.
    const unknown = await app.inject({ method: "POST", url: "/api/runs/nope/cancel" });
    expect(unknown.statusCode).toBe(404);
  });

  it("run state is durable across a restart (reopen the db)", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/runs", payload: { type: "manual", title: "Durable" } })).json();
    const { db: db2 } = initPersistence(paths);
    const app2 = await buildApp(db2, vi.fn() as unknown as Emit);
    const res = await app2.inject({ method: "GET", url: `/api/runs/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Durable");
    await app2.close();
    db2.close();
  });

  // ---- MIN-18 guard -------------------------------------------------------

  it("planning run with Claude unavailable → created run is failed + log event w/ useful message; emits run_created + run_status_changed", async () => {
    await withClaude(false);
    const res = await app.inject({ method: "POST", url: "/api/runs", payload: { type: "planning", title: "No claude" } });
    expect(res.statusCode).toBe(201);
    const run = res.json();
    expect(run.status).toBe("failed");

    const events = (await app.inject({ method: "GET", url: `/api/runs/${run.id}/events` })).json();
    const log = events.find((e: { kind: string }) => e.kind === "log");
    expect(log).toBeDefined();
    expect(typeof log.payload.message).toBe("string");
    expect(log.payload.message.toLowerCase()).toContain("claude");

    expect(emit.mock.calls.some((c) => c[1] === "run_created")).toBe(true);
    expect(emit.mock.calls.some((c) => c[1] === "run_status_changed")).toBe(true);
  });

  it("execution run with Claude unavailable → also failed gracefully", async () => {
    await withClaude(false);
    const res = await app.inject({ method: "POST", url: "/api/runs", payload: { type: "execution" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("failed");
  });

  // ---- MIN-18 status route ------------------------------------------------

  it("GET /api/claude/status returns the { ready, version?, error? } shape", async () => {
    await withClaude(true);
    const res = await app.inject({ method: "GET", url: "/api/claude/status" });
    expect(res.statusCode).toBe(200);
    const status = res.json();
    expect(status.ready).toBe(true);
    expect(status.version).toBe("9.9.9");

    await withClaude(false);
    const missing = await app.inject({ method: "GET", url: "/api/claude/status" });
    expect(missing.json().ready).toBe(false);
    expect(typeof missing.json().error).toBe("string");
  });

  // ---- MIN-45 bootstrap + exposure ---------------------------------------

  it("GET /api/project returns the default project with root/dataDir", async () => {
    const res = await app.inject({ method: "GET", url: "/api/project" });
    expect(res.statusCode).toBe(200);
    const project = res.json();
    expect(project.id).toBe(DEFAULT_PROJECT_ID);
    expect(project.root).toBe(paths.root);
    expect(project.dataDir).toBe(paths.dataDir);
  });

  it("bootstrapDefaultProject is idempotent — second call reuses the same id + updates paths", async () => {
    const first = bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });
    const second = bootstrapDefaultProject(db, { name: "Renamed", root: "/new/root", dataDir: "/new/data" });
    expect(second.id).toBe(first.id);
    expect(second.id).toBe(DEFAULT_PROJECT_ID);
    expect(second.name).toBe("Renamed");
    expect(second.root).toBe("/new/root");
    expect(second.dataDir).toBe("/new/data");
    // restore the real paths so later/other tests see the right values
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });
  });

  it("ticket creation still works when Claude is missing (readiness does not gate ticket CRUD)", async () => {
    await withClaude(false);
    // Use the real ticket repo directly — runtime routes do not register tickets,
    // but the point is that a missing Claude never blocks ticket persistence.
    const { createTicketRepository } = await import("@otter/persistence");
    const tickets = createTicketRepository(db);
    const ticket = tickets.create({ title: "Still works" });
    expect(ticket.id).toBeTruthy();
    // ticket.project_id backfills to the default via the migration DEFAULT — assert
    // at the DB level since the Ticket domain type doesn't surface projectId.
    const row = db.prepare("SELECT project_id FROM ticket WHERE id = ?").get(ticket.id) as {
      project_id: string;
    };
    expect(row.project_id).toBe(DEFAULT_PROJECT_ID);
  });
});
