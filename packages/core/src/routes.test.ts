/**
 * Route tests (MIN-14 routes + MIN-15) against a REAL temp SQLite db.
 *
 * Builds a Fastify server via `createServer(config, paths, db)` where `db` comes from the
 * real `@otter/persistence` `initPersistence` on a temp data dir, then drives it with
 * `app.inject(...)`. Skips (does not fail) if persistence repos aren't importable yet —
 * the orchestrator runs the full suite once Impl A has landed.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig, resolvePaths, type OtterPaths } from "@otter/shared";
import type { Database } from "@otter/persistence";
import { createServer } from "./server.js";

// Probe persistence: needs initPersistence + the ticket-core repo factories (Impl A).
let persistence: typeof import("@otter/persistence") | undefined;
try {
  const mod = await import("@otter/persistence");
  persistence =
    typeof (mod as Record<string, unknown>).createTicketRepository === "function" &&
    typeof (mod as Record<string, unknown>).applyTransition === "function"
      ? mod
      : undefined;
} catch {
  persistence = undefined;
}

const maybe = persistence ? describe : describe.skip;
const config = loadConfig({}, "/srv/app");

maybe("ticket-core routes (real SQLite)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-routes-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = persistence!.initPersistence(paths));
    app = await createServer(config, paths, db);
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("POST /api/tickets creates a ticket (201, status=created, blockStatus=none)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tickets",
      payload: { title: "First ticket", description: "hello" },
    });
    expect(res.statusCode).toBe(201);
    const t = res.json();
    expect(t.id).toBeTruthy();
    expect(t.title).toBe("First ticket");
    expect(t.status).toBe("created");
    expect(t.blockStatus).toBe("none");
    expect(t.createdAt).toBeTruthy();
  });

  it("POST /api/tickets rejects empty title with 400 {error}", async () => {
    const res = await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "  " } });
    expect(res.statusCode).toBe(400);
    expect(typeof res.json().error).toBe("string");
  });

  it("GET /api/tickets lists tickets oldest-first", async () => {
    await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Second" } });
    const res = await app.inject({ method: "GET", url: "/api/tickets" });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].title).toBe("First ticket");
  });

  it("GET /api/tickets/:id returns the ticket, 404 for unknown", async () => {
    const created = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Getme" } })
    ).json();
    const ok = await app.inject({ method: "GET", url: `/api/tickets/${created.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().title).toBe("Getme");

    const missing = await app.inject({ method: "GET", url: "/api/tickets/does-not-exist" });
    expect(missing.statusCode).toBe(404);
    expect(typeof missing.json().error).toBe("string");
  });

  it("PATCH /api/tickets/:id updates title/description and bumps updatedAt", async () => {
    const created = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Old" } })
    ).json();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${created.id}`,
      payload: { title: "New title", description: "desc" },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json();
    expect(t.title).toBe("New title");
    expect(t.description).toBe("desc");
    expect(t.status).toBe("created"); // PATCH never changes status

    const missing = await app.inject({
      method: "PATCH",
      url: "/api/tickets/nope",
      payload: { title: "x" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("comments: POST creates (201), GET lists oldest-first; 404 unknown ticket; 400 empty body", async () => {
    const ticket = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Commented" } })
    ).json();

    const c1 = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/comments`,
      payload: { body: "first", author: "alice", metadata: { k: 1 } },
    });
    expect(c1.statusCode).toBe(201);
    expect(c1.json().body).toBe("first");
    expect(c1.json().metadata).toEqual({ k: 1 });

    await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/comments`,
      payload: { body: "second" },
    });

    const list = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}/comments` });
    expect(list.statusCode).toBe(200);
    const comments = list.json();
    expect(comments.map((c: { body: string }) => c.body)).toEqual(["first", "second"]);

    const empty = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/comments`,
      payload: { body: "  " },
    });
    expect(empty.statusCode).toBe(400);

    const badMeta = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/comments`,
      payload: { body: "x", metadata: [1, 2] },
    });
    expect(badMeta.statusCode).toBe(400);

    const missing = await app.inject({
      method: "GET",
      url: "/api/tickets/nope/comments",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /transitions returns {current, next}; 404 unknown", async () => {
    const ticket = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Trans" } })
    ).json();
    const res = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}/transitions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ current: "created", next: ["plannable", "canceled"] });

    const missing = await app.inject({ method: "GET", url: "/api/tickets/nope/transitions" });
    expect(missing.statusCode).toBe(404);
  });

  it("POST /transitions happy path changes status AND writes exactly one event", async () => {
    const ticket = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Move" } })
    ).json();

    const res = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transitions`,
      payload: { to: "plannable", detail: "ready to plan" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("plannable");

    // status persisted on the ticket
    const got = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}` });
    expect(got.json().status).toBe("plannable");

    // exactly one event recorded for this transition
    const events = persistence!.createTicketEventRepository(db).listByTicket(ticket.id);
    expect(events.length).toBe(1);
    expect(events[0]?.fromStatus).toBe("created");
    expect(events[0]?.toStatus).toBe("plannable");
    expect(events[0]?.detail).toBe("ready to plan");
  });

  it("POST /transitions rejects a disallowed transition with 400 {error}", async () => {
    const ticket = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Bad" } })
    ).json();
    const res = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transitions`,
      payload: { to: "executable" }, // created → executable is not allowed
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not allowed/);

    const badInput = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transitions`,
      payload: { to: "not-a-status" },
    });
    expect(badInput.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/api/tickets/nope/transitions",
      payload: { to: "plannable" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("→ in_progress blocked when ticket is blocked", async () => {
    const ticket = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Blockme" } })
    ).json();
    // walk created → plannable → needs_user_approval → executable
    const repo = persistence!.createTicketRepository(db);
    repo.setStatus(ticket.id, "executable");
    repo.setStatus(ticket.id, "executable", "blocked");

    const res = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transitions`,
      payload: { to: "in_progress" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/blocked/);
  });

  it("persists across a fresh db handle reopened on the same file (restart-equivalent)", async () => {
    const created = (
      await app.inject({ method: "POST", url: "/api/tickets", payload: { title: "Durable" } })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/tickets/${created.id}/transitions`,
      payload: { to: "plannable" },
    });

    // Reopen the SAME db file with a fresh handle + fresh server (simulating restart).
    const { db: db2 } = persistence!.initPersistence(paths);
    const app2 = await createServer(config, paths, db2);
    const res = await app2.inject({ method: "GET", url: `/api/tickets/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Durable");
    expect(res.json().status).toBe("plannable");
    await app2.close();
  });
});
