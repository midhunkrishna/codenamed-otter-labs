/**
 * Context packet — Clarification Forms section (MIN-27 §2.5) + the planning
 * template additions (MIN-27 §1.7), Impl-C. Real temp SQLite; we create a form
 * via the form repo, submit answers, and assert the deterministic section + the
 * FORM_OUTPUT_CONTRACT / ask-don't-assume prose.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resolvePaths,
  type OtterPaths,
  type FormAnswer,
  FORM_MARKER_START,
  FORM_MARKER_END,
} from "@otter/shared";
import {
  initPersistence,
  createTicketRepository,
  createCommentRepository,
  createFormRepository,
  type Database,
} from "@otter/persistence";
import { buildTicketContext } from "./context/packet.js";
import { PLANNING_INSTRUCTIONS, FORM_OUTPUT_CONTRACT } from "./context/templates.js";

describe("context packet — Clarification Forms section (MIN-27)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-context-forms-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("renders the form with question/answer, status line, fenced text", () => {
    const ticket = createTicketRepository(db).create({ title: "Forms ticket" });
    // The form-kind comment is created first (per Impl-A handshake), then the form.
    const comment = createCommentRepository(db).create(ticket.id, {
      body: "I have a question.",
      author: "spec-runner",
      metadata: { kind: "form" },
    });
    const formRepo = createFormRepository(db);
    const form = formRepo.create({
      ticketId: ticket.id,
      commentId: comment.id,
      phase: "planning",
      title: "OAuth provider details",
      blocksTicket: true,
      commentBody: "I have a question.",
      questions: [
        {
          key: "provider",
          type: "single_select",
          label: "Which provider?",
          required: true,
          options: [
            { label: "Google", value: "google" },
            { label: "GitHub", value: "github" },
          ],
        },
      ],
    });

    // Submit an answer so the section shows Q + A.
    const question = form.questions[0]!;
    const answer: FormAnswer = {
      id: "",
      formId: form.id,
      questionId: question.id,
      questionKey: question.key,
      answeredByUserId: null,
      value: "google",
      createdAt: new Date().toISOString(),
    };
    formRepo.submit(form.id, [answer]);

    const doc = buildTicketContext(db, ticket.id, { mode: "planning", projectRoot: paths.root });
    expect(doc).toContain("## Clarification Forms");
    expect(doc).toContain("OAuth provider details");
    expect(doc).toContain("provider");
    expect(doc).toContain("Which provider?");
    expect(doc).toContain("google"); // the answer value
    expect(doc).toContain("Status: submitted");
    expect(doc).toContain("blocks ticket");
  });

  it("omits the Clarification Forms section when there are no forms", () => {
    const ticket = createTicketRepository(db).create({ title: "No forms" });
    const doc = buildTicketContext(db, ticket.id, { mode: "planning", projectRoot: paths.root });
    expect(doc).not.toContain("## Clarification Forms");
  });

  it("is byte-deterministic with a form present", () => {
    const ticket = createTicketRepository(db).create({ title: "Det forms" });
    const comment = createCommentRepository(db).create(ticket.id, {
      body: "q",
      metadata: { kind: "form" },
    });
    createFormRepository(db).create({
      ticketId: ticket.id,
      commentId: comment.id,
      phase: "planning",
      title: "Pick one",
      commentBody: "q",
      questions: [{ key: "k", type: "short_text", label: "What?" }],
    });
    const a = buildTicketContext(db, ticket.id, { mode: "planning", projectRoot: paths.root });
    const b = buildTicketContext(db, ticket.id, { mode: "planning", projectRoot: paths.root });
    expect(a).toBe(b);
  });
});

describe("planning template — OTTER_FORM contract + ask-don't-assume (MIN-27 §1.7)", () => {
  it("planning instructions contain the FORM_OUTPUT_CONTRACT", () => {
    expect(PLANNING_INSTRUCTIONS).toContain(FORM_OUTPUT_CONTRACT);
    expect(FORM_OUTPUT_CONTRACT).toContain(FORM_MARKER_START);
    expect(FORM_OUTPUT_CONTRACT).toContain(FORM_MARKER_END);
    // The 5 MVP field types are documented.
    const types = ["short_text", "long_text", "single_select", "multi_select", "boolean"];
    const missing = types.filter((t) => !FORM_OUTPUT_CONTRACT.includes(t));
    expect(missing).toEqual([]);
  });

  it("planning instructions state the ask-don't-assume policy + mutual exclusion", () => {
    expect(PLANNING_INSTRUCTIONS.toLowerCase()).toContain("ask, don't assume");
    expect(PLANNING_INSTRUCTIONS.toLowerCase()).toContain("prefer asking over assuming");
    // EITHER plan OR form, not both.
    expect(PLANNING_INSTRUCTIONS).toContain("EITHER");
  });

  it("planning packet built by buildTicketContext carries the contract", async () => {
    const { db } = initPersistence(paths2());
    const ticket = createTicketRepository(db).create({ title: "Has contract" });
    const doc = buildTicketContext(db, ticket.id, { mode: "planning", projectRoot: "/tmp/x" });
    expect(doc).toContain(FORM_MARKER_START);
    expect(doc.toLowerCase()).toContain("ask, don't assume");
  });
});

/** A throwaway temp paths for the contract-in-packet check. */
function paths2(): OtterPaths {
  const dir = join(tmpdir(), `otter-ctx2-${Math.random().toString(36).slice(2)}`);
  return resolvePaths(dir, join(dir, ".otter-labs"));
}
