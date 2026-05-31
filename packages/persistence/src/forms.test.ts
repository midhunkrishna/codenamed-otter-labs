import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths, type CreateFormInput, type FormAnswer } from "@otter/shared";
import type { Database } from "./index.js";
import {
  initPersistence,
  createTicketRepository,
  createCommentRepository,
  createFormRepository,
} from "./index.js";

let tmp: string;
let db: Database.Database;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "otter-forms-"));
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

/** A minimal valid create input bound to a ticket+comment. */
function createInput(
  ticketId: string,
  commentId: string,
  over: Partial<CreateFormInput> = {},
): CreateFormInput & { ticketId: string; commentId: string } {
  return {
    ticketId,
    commentId,
    phase: "planning",
    title: "Clarify auth",
    description: "We need a decision",
    commentBody: "Please answer",
    questions: [
      { key: "provider", type: "single_select", label: "Provider", required: true, options: [
        { label: "Google", value: "google" },
        { label: "GitHub", value: "github" },
      ] },
      { key: "notes", type: "long_text", label: "Notes", required: false },
    ],
    ...over,
  };
}

describe("migration 0006", () => {
  it("creates the forms / form_questions / form_answers tables + indexes", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('forms','form_questions','form_answers')",
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name).sort()).toEqual(["form_answers", "form_questions", "forms"]);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_forms_ticket','idx_form_questions_form','idx_form_answers_form')",
      )
      .all() as { name: string }[];
    expect(indexes.length).toBe(3);
  });
});

describe("form repository", () => {
  it("create persists the form + questions and get hydrates them", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, { body: "form", metadata: { kind: "form" } });

    const created = forms.create(createInput(t.id, c.id, { runId: "run_1" }));
    expect(created.status).toBe("open");
    expect(created.runId).toBe("run_1");
    expect(created.blocksTicket).toBe(true);
    expect(created.questions).toHaveLength(2);
    expect(created.questions[0]?.key).toBe("provider");
    expect(created.questions[0]?.options).toHaveLength(2);
    expect(created.questions[0]?.sortOrder).toBe(0);
    expect(created.answers).toHaveLength(0);

    const fetched = forms.get(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.questions).toHaveLength(2);
  });

  it("getByComment finds the form attached to a comment", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, { body: "form" });
    const created = forms.create(createInput(t.id, c.id));
    expect(forms.getByComment(c.id)?.id).toBe(created.id);
    expect(forms.getByComment("ghost")).toBeUndefined();
  });

  it("submit stores answers, flips status to submitted, sets submitted_at", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, { body: "form" });
    const f = forms.create(createInput(t.id, c.id));
    const pq = f.questions[0]!;

    const answers: FormAnswer[] = [
      {
        id: "",
        formId: f.id,
        questionId: pq.id,
        questionKey: pq.key,
        answeredByUserId: "user",
        value: "google",
        createdAt: "",
      },
    ];
    const submitted = forms.submit(f.id, answers);
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.answers).toHaveLength(1);
    expect(submitted.answers[0]?.value).toBe("google");
    expect(submitted.answers[0]?.questionKey).toBe("provider");
  });

  it("submit throws when the form is not open (idempotent re-submit guard)", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, { body: "form" });
    const f = forms.create(createInput(t.id, c.id));
    forms.submit(f.id, []);
    expect(() => forms.submit(f.id, [])).toThrow();
    expect(() => forms.submit("ghost", [])).toThrow();
  });

  it("dismiss records who/why and throws if not open", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, { body: "form" });
    const f = forms.create(createInput(t.id, c.id));

    const dismissed = forms.dismiss(f.id, "no longer needed", "user");
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismissedAt).not.toBeNull();
    expect(dismissed.description).toContain("no longer needed");
    expect(dismissed.description).toContain("user");

    expect(() => forms.dismiss(f.id)).toThrow();
  });

  it("listOpenBlockingByTicket returns only open blocking forms", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });

    const c1 = comments.create(t.id, { body: "f1" });
    const blocking = forms.create(createInput(t.id, c1.id, { blocksTicket: true }));

    const c2 = comments.create(t.id, { body: "f2" });
    forms.create(createInput(t.id, c2.id, { blocksTicket: false }));

    const c3 = comments.create(t.id, { body: "f3" });
    const submitted = forms.create(createInput(t.id, c3.id, { blocksTicket: true }));
    forms.submit(submitted.id, []);

    const open = forms.listOpenBlockingByTicket(t.id);
    expect(open.map((f) => f.id)).toEqual([blocking.id]);
  });

  it("listByTicket returns all forms newest-first", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const forms = createFormRepository(db);
    const t = tickets.create({ title: "T" });
    const c1 = comments.create(t.id, { body: "f1" });
    const c2 = comments.create(t.id, { body: "f2" });
    const f1 = forms.create(createInput(t.id, c1.id));
    const f2 = forms.create(createInput(t.id, c2.id));
    const ids = forms.listByTicket(t.id).map((f) => f.id);
    expect(ids).toContain(f1.id);
    expect(ids).toContain(f2.id);
    expect(ids).toHaveLength(2);
  });
});

describe("comment setMetadata", () => {
  it("merges into existing metadata and persists", () => {
    const tickets = createTicketRepository(db);
    const comments = createCommentRepository(db);
    const t = tickets.create({ title: "T" });
    const c = comments.create(t.id, {
      body: "hi",
      metadata: { kind: "user", sendToAgent: true },
    });

    const updated = comments.setMetadata(c.id, {
      agentDeliveryStatus: "delivered",
      targetRunId: "run_9",
    });
    expect(updated.metadata.kind).toBe("user");
    expect(updated.metadata.sendToAgent).toBe(true);
    expect(updated.metadata.agentDeliveryStatus).toBe("delivered");
    expect(updated.metadata.targetRunId).toBe("run_9");

    // A second merge overwrites only the given key.
    const again = comments.setMetadata(c.id, { agentDeliveryStatus: "pending" });
    expect(again.metadata.agentDeliveryStatus).toBe("pending");
    expect(again.metadata.targetRunId).toBe("run_9");

    expect(() => comments.setMetadata("ghost", {})).toThrow();
  });
});
