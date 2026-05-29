import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths } from "@otter/shared";
import type { Database } from "./index.js";
import {
  initPersistence,
  createTicketRepository,
  createCommentRepository,
  createTicketEventRepository,
  applyTransition,
} from "./index.js";

let tmp: string;
let db: Database.Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-repo-"));
  db = initPersistence(resolvePaths(tmp)).db;
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("ticket repository", () => {
  it("create persists a ticket with created/none defaults and a stable id", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "Hello", description: "world" });
    expect(t.id).toBeTruthy();
    expect(t.title).toBe("Hello");
    expect(t.description).toBe("world");
    expect(t.status).toBe("created");
    expect(t.blockStatus).toBe("none");
    expect(t.createdAt).toMatch(/Z$/);
    expect(t.updatedAt).toBe(t.createdAt);

    const got = repo.get(t.id);
    expect(got).toEqual(t);
  });

  it("create defaults description to empty string", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "No desc" });
    expect(t.description).toBe("");
  });

  it("create rejects empty/whitespace title", () => {
    const repo = createTicketRepository(db);
    expect(() => repo.create({ title: "" })).toThrow();
    expect(() => repo.create({ title: "   " })).toThrow();
  });

  it("get returns undefined for unknown id", () => {
    const repo = createTicketRepository(db);
    expect(repo.get("nope")).toBeUndefined();
  });

  it("list returns tickets oldest first", () => {
    const repo = createTicketRepository(db);
    const a = repo.create({ title: "a" });
    const b = repo.create({ title: "b" });
    const c = repo.create({ title: "c" });
    expect(repo.list().map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });

  it("update bumps updatedAt and changes fields", async () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "orig" });
    await new Promise((r) => setTimeout(r, 5));
    const u = repo.update(t.id, { title: "new", description: "d" });
    expect(u?.title).toBe("new");
    expect(u?.description).toBe("d");
    expect(u?.createdAt).toBe(t.createdAt);
    expect(u!.updatedAt >= t.updatedAt).toBe(true);
    expect(u!.updatedAt).not.toBe("");
  });

  it("update never changes status", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "orig" });
    const u = repo.update(t.id, { title: "x" });
    expect(u?.status).toBe("created");
  });

  it("update returns undefined for unknown id", () => {
    const repo = createTicketRepository(db);
    expect(repo.update("nope", { title: "x" })).toBeUndefined();
  });

  it("setStatus updates status and optional blockStatus", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "x" });
    const u = repo.setStatus(t.id, "plannable", "blocked");
    expect(u?.status).toBe("plannable");
    expect(u?.blockStatus).toBe("blocked");
  });

  it("setStatus rejects an invalid status value", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "x" });
    expect(() => repo.setStatus(t.id, "bogus" as never)).toThrow();
  });

  it("setStatus rejects an invalid blockStatus value", () => {
    const repo = createTicketRepository(db);
    const t = repo.create({ title: "x" });
    expect(() => repo.setStatus(t.id, "plannable", "weird" as never)).toThrow();
  });

  it("setStatus returns undefined for unknown id", () => {
    const repo = createTicketRepository(db);
    expect(repo.setStatus("nope", "plannable")).toBeUndefined();
  });
});

describe("comment repository", () => {
  it("create persists a comment with defaults", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "x" });
    const c = comments.create(t.id, { body: "hi" });
    expect(c.id).toBeTruthy();
    expect(c.ticketId).toBe(t.id);
    expect(c.body).toBe("hi");
    expect(c.author).toBe("");
    expect(c.metadata).toEqual({});
    expect(c.createdAt).toMatch(/Z$/);
  });

  it("create stores author and metadata, parsed back as an object", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "x" });
    const c = comments.create(t.id, { body: "hi", author: "claude", metadata: { k: 1, nested: { a: true } } });
    expect(c.author).toBe("claude");
    expect(c.metadata).toEqual({ k: 1, nested: { a: true } });
  });

  it("listByTicket returns oldest first", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "x" });
    const a = comments.create(t.id, { body: "1" });
    const b = comments.create(t.id, { body: "2" });
    const c = comments.create(t.id, { body: "3" });
    expect(comments.listByTicket(t.id).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("rejects empty/whitespace body", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "x" });
    expect(() => comments.create(t.id, { body: "" })).toThrow();
    expect(() => comments.create(t.id, { body: "   " })).toThrow();
  });

  it("rejects non-object metadata (array, primitive, null)", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "x" });
    expect(() => comments.create(t.id, { body: "b", metadata: [1, 2] as never })).toThrow();
    expect(() => comments.create(t.id, { body: "b", metadata: 5 as never })).toThrow();
    expect(() => comments.create(t.id, { body: "b", metadata: "str" as never })).toThrow();
    expect(() => comments.create(t.id, { body: "b", metadata: null as never })).toThrow();
  });
});

describe("applyTransition + event repository", () => {
  it("atomically sets status, bumps updatedAt and writes exactly one event", async () => {
    const tickets = createTicketRepository(db);
    const events = createTicketEventRepository(db);
    const t = tickets.create({ title: "x" });
    await new Promise((r) => setTimeout(r, 5));

    const { ticket, event } = applyTransition(db, {
      ticketId: t.id,
      fromStatus: "created",
      toStatus: "plannable",
      detail: "moving on",
    });

    expect(ticket.status).toBe("plannable");
    expect(ticket.updatedAt >= t.updatedAt).toBe(true);
    expect(tickets.get(t.id)?.status).toBe("plannable");

    expect(event.ticketId).toBe(t.id);
    expect(event.fromStatus).toBe("created");
    expect(event.toStatus).toBe("plannable");
    expect(event.detail).toBe("moving on");

    const evs = events.listByTicket(t.id);
    expect(evs.length).toBe(1);
    expect(evs[0]?.id).toBe(event.id);
  });

  it("records events oldest first", () => {
    const tickets = createTicketRepository(db);
    const events = createTicketEventRepository(db);
    const t = tickets.create({ title: "x" });
    applyTransition(db, { ticketId: t.id, fromStatus: "created", toStatus: "plannable", detail: "" });
    applyTransition(db, { ticketId: t.id, fromStatus: "plannable", toStatus: "needs_user_approval", detail: "" });
    expect(events.listByTicket(t.id).map((e) => e.toStatus)).toEqual(["plannable", "needs_user_approval"]);
  });

  it("throws and rolls back (no status change, no event) when the ticket is missing", () => {
    const events = createTicketEventRepository(db);
    expect(() =>
      applyTransition(db, { ticketId: "ghost", fromStatus: "created", toStatus: "plannable", detail: "" }),
    ).toThrow();
    expect(events.listByTicket("ghost").length).toBe(0);
  });
});
