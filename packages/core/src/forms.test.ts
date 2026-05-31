/**
 * Clarification-form backend tests (MIN-27, plan §2.4/§2.6) — Impl-B.
 *
 * Real temp SQLite + real repos, with the MIN-26 `forwardComment` as a `vi.fn()`
 * fake (so we assert it is called on submit without booting the forwarder/runner).
 * The form service + routes are exercised both directly (unit) and over HTTP
 * (`registerFormsRoutes` on a bare Fastify), mirroring the planApproval harness.
 *
 * Coverage:
 *  - createForm: form comment (kind:form, formId), attention opened, ticket blocked,
 *    producing run parked at waiting_on_user_input, form_created emitted.
 *  - submit: validates, structured answers stored, transcript comment (form_answer,
 *    sendToAgent), attention resolved, block cleared, forwardComment called.
 *  - submit when not open → 409 (idempotency).
 *  - schema rejects unsupported field type (400).
 *  - answer validation: missing required / select-not-in-options / multi-unknown (400).
 *  - dismiss: resolves attention + clears block + records who/why.
 *  - HTTP routes: 201 / 404 / 400 / 409 status mapping.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaths, type Comment, type CreateFormInput, type OtterPaths } from "@otter/shared";
import {
  initPersistence,
  createTicketRepository,
  createCommentRepository,
  createFormRepository,
  createAttentionRepository,
  createAgentRunRepository,
  type Database,
} from "@otter/persistence";
import { bootstrapDefaultProject } from "./runtime/index.js";
import { createFormService, type FormService } from "./forms/service.js";
import { registerFormsRoutes } from "./routes/forms.js";

/** A blocking planning form with one required single_select + one optional boolean. */
function sampleForm(overrides: Partial<CreateFormInput> = {}): CreateFormInput {
  return {
    phase: "planning",
    title: "OAuth provider",
    commentBody: "Which OAuth provider should we integrate?",
    blocksTicket: true,
    createdByAgentId: "spec-runner",
    questions: [
      {
        key: "provider",
        type: "single_select",
        label: "Provider",
        required: true,
        options: [
          { label: "Google", value: "google" },
          { label: "GitHub", value: "github" },
        ],
      },
      { key: "pkce", type: "boolean", label: "Use PKCE?", required: false },
    ],
    ...overrides,
  };
}

describe("form service + routes (real SQLite, fake forwardComment)", () => {
  let dir: string;
  let paths: OtterPaths;
  let db: Database.Database;
  let app: FastifyInstance;
  let forwardComment: ReturnType<typeof vi.fn>;
  let service: FormService;

  const tickets = () => createTicketRepository(db);
  const comments = () => createCommentRepository(db);
  const forms = () => createFormRepository(db);
  const attention = () => createAttentionRepository(db);
  const runs = () => createAgentRunRepository(db);

  function makeTicketBlockable(title: string): string {
    const t = tickets().create({ title });
    // Move to a non-terminal status so block_status is meaningful.
    tickets().setStatus(t.id, "plannable");
    return t.id;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "otter-forms-"));
    paths = resolvePaths(dir, join(dir, ".otter-labs"));
    ({ db } = initPersistence(paths));
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });

    forwardComment = vi.fn(async (_c: Comment) => {});
    service = createFormService({
      db,
      forms: forms(),
      comments: comments(),
      attention: attention(),
      tickets: tickets(),
      runs: runs(),
      emit: () => {},
      forwardComment: forwardComment as unknown as (c: Comment) => Promise<void>,
    });

    app = Fastify({ logger: false });
    registerFormsRoutes(app, { db, formService: service });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("createForm: form comment, attention opened, ticket blocked, run parked", () => {
    const ticketId = makeTicketBlockable("OAuth ticket");
    const run = runs().create({ type: "planning", ticketId, title: "Planning" });

    const { form, comment } = service.createForm(ticketId, sampleForm({ runId: run.id }));

    // form comment kind + backfilled formId
    expect(comment.metadata).toMatchObject({ kind: "form", formId: form.id });
    expect(form.questions).toHaveLength(2);
    expect(form.status).toBe("open");

    // attention opened
    const open = attention().list({ status: "open", ticketId });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      attentionType: "clarification_required",
      sourceType: "form",
      sourceId: form.id,
    });

    // ticket blocked (block_status, not a new lifecycle state)
    expect(tickets().get(ticketId)!.blockStatus).toBe("blocked");
    expect(tickets().get(ticketId)!.status).toBe("plannable");

    // producing run re-parked
    expect(runs().get(run.id)!.status).toBe("waiting_on_user_input");
  });

  it("submit: structured answers + transcript + attention resolved + block cleared + forwarded", async () => {
    const ticketId = makeTicketBlockable("Submit ticket");
    const { form } = service.createForm(ticketId, sampleForm());
    expect(tickets().get(ticketId)!.blockStatus).toBe("blocked");

    const { form: submitted, transcript } = await service.submitForm(form.id, {
      answers: { provider: "github", pkce: true },
      answeredByUserId: "user",
    });

    // structured answers persisted
    expect(submitted.status).toBe("submitted");
    expect(submitted.answers).toHaveLength(2);
    const provider = submitted.answers.find((a) => a.questionKey === "provider");
    expect(provider?.value).toBe("github");

    // human-readable transcript comment
    expect(transcript.metadata).toMatchObject({ kind: "form_answer", formId: form.id, sendToAgent: true });
    expect(transcript.body).toContain("Provider: GitHub");
    expect(transcript.body).toContain("Use PKCE?: Yes");

    // attention resolved
    expect(attention().list({ status: "open", ticketId })).toHaveLength(0);

    // block cleared (no other open blocking forms)
    expect(tickets().get(ticketId)!.blockStatus).toBe("none");

    // forwarded over the MIN-26 path with the transcript comment
    expect(forwardComment).toHaveBeenCalledTimes(1);
    expect(forwardComment.mock.calls[0]?.[0]).toMatchObject({ id: transcript.id });
  });

  it("submit when not open → FormConflictError (409 path)", async () => {
    const ticketId = makeTicketBlockable("Idempotent");
    const { form } = service.createForm(ticketId, sampleForm());
    await service.submitForm(form.id, { answers: { provider: "google" } });
    await expect(service.submitForm(form.id, { answers: { provider: "google" } })).rejects.toThrow(
      /expected open/,
    );
  });

  it("rejects an unsupported field type at create (400 via FormValidationError)", () => {
    const ticketId = makeTicketBlockable("Bad type");
    expect(() =>
      service.createForm(ticketId, {
        phase: "planning",
        title: "X",
        commentBody: "?",
        questions: [{ key: "q", type: "date" as never, label: "When" }],
      }),
    ).toThrow(/unsupported field type/);
  });

  it("rejects missing required / select-not-in-options / multi-unknown-option (400)", async () => {
    const ticketId = makeTicketBlockable("Answer validation");
    const { form } = service.createForm(ticketId, {
      phase: "planning",
      title: "V",
      commentBody: "?",
      questions: [
        {
          key: "one",
          type: "single_select",
          label: "One",
          required: true,
          options: [{ label: "A", value: "a" }],
        },
        {
          key: "many",
          type: "multi_select",
          label: "Many",
          required: false,
          options: [{ label: "X", value: "x" }],
        },
      ],
    });

    await expect(service.submitForm(form.id, { answers: {} })).rejects.toThrow(/required/);
    await expect(service.submitForm(form.id, { answers: { one: "nope" } })).rejects.toThrow(
      /not one of its options/,
    );
    await expect(
      service.submitForm(form.id, { answers: { one: "a", many: ["bogus"] } }),
    ).rejects.toThrow(/unknown option/);

    // form is still open after failed attempts (no partial submit)
    expect(forms().get(form.id)!.status).toBe("open");
  });

  it("dismiss: resolves attention, clears block, records who/why, does not forward", () => {
    const ticketId = makeTicketBlockable("Dismiss");
    const { form } = service.createForm(ticketId, sampleForm());

    const dismissed = service.dismissForm(form.id, "not needed", "user");
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.description).toContain("dismissed by user: not needed");
    expect(attention().list({ status: "open", ticketId })).toHaveLength(0);
    expect(tickets().get(ticketId)!.blockStatus).toBe("none");
    expect(forwardComment).not.toHaveBeenCalled();
  });

  // --- HTTP route status mapping ---

  it("POST /api/tickets/:id/forms → 201; 404 unknown ticket; 400 bad schema", async () => {
    const ticketId = makeTicketBlockable("HTTP create");
    const ok = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticketId}/forms`,
      payload: sampleForm(),
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().form.status).toBe("open");

    const missing = await app.inject({
      method: "POST",
      url: `/api/tickets/nope/forms`,
      payload: sampleForm(),
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticketId}/forms`,
      payload: { phase: "planning", title: "Y", commentBody: "?", questions: [] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("empty_questions");
  });

  it("POST /api/forms/:id/submit → 200; 409 when not open; 400 bad answers; 404 unknown", async () => {
    const ticketId = makeTicketBlockable("HTTP submit");
    const { form } = service.createForm(ticketId, sampleForm());

    const ok = await app.inject({
      method: "POST",
      url: `/api/forms/${form.id}/submit`,
      payload: { answers: { provider: "google" } },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().transcript.metadata.kind).toBe("form_answer");

    const conflict = await app.inject({
      method: "POST",
      url: `/api/forms/${form.id}/submit`,
      payload: { answers: { provider: "google" } },
    });
    expect(conflict.statusCode).toBe(409);

    const { form: form2 } = service.createForm(ticketId, sampleForm());
    const badAnswer = await app.inject({
      method: "POST",
      url: `/api/forms/${form2.id}/submit`,
      payload: { answers: { provider: "not-an-option" } },
    });
    expect(badAnswer.statusCode).toBe(400);
    expect(badAnswer.json().code).toBe("select_not_in_options");

    const missing = await app.inject({ method: "POST", url: `/api/forms/nope/submit`, payload: {} });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /api/tickets/:id/forms + GET /api/forms/:id + POST dismiss (409 re-dismiss)", async () => {
    const ticketId = makeTicketBlockable("HTTP gets");
    const { form } = service.createForm(ticketId, sampleForm());

    const list = await app.inject({ method: "GET", url: `/api/tickets/${ticketId}/forms` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const one = await app.inject({ method: "GET", url: `/api/forms/${form.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(form.id);

    const dismiss = await app.inject({ method: "POST", url: `/api/forms/${form.id}/dismiss`, payload: {} });
    expect(dismiss.statusCode).toBe(200);
    const redismiss = await app.inject({ method: "POST", url: `/api/forms/${form.id}/dismiss`, payload: {} });
    expect(redismiss.statusCode).toBe(409);
  });
});
