/**
 * Clarification-form lifecycle service (MIN-27, plan §2.4) — Impl-B.
 *
 * ONE service drives BOTH form producers (the `OTTER_FORM` Claude output path via
 * the orchestrator, and the internal `POST /api/tickets/:id/forms` route) so the
 * create / submit / dismiss behavior is identical regardless of who asks.
 *
 * Fully dependency-injected (db + repos + emit + `forwardComment` + an optional
 * run-status setter) so it unit-tests with fakes WITHOUT booting `server.ts`.
 *
 * Invariants honored here (plan §7):
 *  - clarification is a `form` kind comment in the stream;
 *  - a blocking, unanswered form blocks the ticket via `block_status` (NOT a new
 *    lifecycle state — domain BlockStatus is `none|blocked`);
 *  - a required form opens a `clarification_required` Attention item; submit/dismiss
 *    resolves it;
 *  - submit is idempotent — a non-`open` form rejects (the route maps to 409);
 *  - answers are stored structured (repo) AND as a human-readable transcript comment;
 *  - submit forwards the transcript over the MIN-26 path (the run is parked at
 *    `waiting_on_user_input`), resuming Claude;
 *  - persist BEFORE broadcast (MIN-17): rows written, then `emit`, then forward.
 */
import {
  CHANNELS,
  validateFormSchema,
  validateAnswers,
  type Comment,
  type Form,
  type FormAnswer,
  type CreateFormInput,
  type SubmitFormInput,
} from "@otter/shared";
import type {
  Database,
  FormRepository,
  CommentRepository,
  AttentionRepository,
  TicketRepository,
  AgentRunRepository,
} from "@otter/persistence";
import type { Emit } from "../events/bus.js";

/**
 * A "form is not open" conflict — the route maps this to HTTP 409 (idempotency
 * invariant). Distinct from a `FormValidationError` (400) and a missing form (404).
 */
export class FormConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormConflictError";
  }
}

/** Collaborators the form service needs (the real persistence repos). All injected. */
export interface FormServiceDeps {
  db: Database.Database;
  forms: FormRepository;
  comments: CommentRepository;
  attention: AttentionRepository;
  tickets: TicketRepository;
  /** Optional — present in the live server so a producing run can be re-parked. */
  runs?: AgentRunRepository;
  /** Broadcast hook — called AFTER persist (persist-before-broadcast). */
  emit: Emit;
  /**
   * MIN-26 forwarder — resumes a parked Claude session with the new comment.
   * Awaited on submit; a rejection is swallowed (the answer is already persisted —
   * "failed forwarding never loses the comment"); the forwarder owns the run audit.
   */
  forwardComment: (comment: Comment) => Promise<void>;
}

/** The form service surface (used by the route AND the orchestrator). */
export interface FormService {
  createForm(ticketId: string, input: CreateFormInput): { form: Form; comment: Comment };
  submitForm(formId: string, input: SubmitFormInput): Promise<{ form: Form; transcript: Comment }>;
  dismissForm(formId: string, reason?: string, byUserId?: string): Form;
}

/** Author string for an agent-asked form (plan §1.6: free-string, no auth yet). */
function agentAuthor(createdByAgentId?: string | null): string {
  return createdByAgentId && createdByAgentId.trim() !== "" ? createdByAgentId : "spec-runner";
}

/** Render a stored answer value for the human-readable transcript. */
function renderAnswer(question: Form["questions"][number], value: unknown): string {
  if (value === undefined || value === null) return "(no answer)";
  if (Array.isArray(value)) {
    const labels = value.map((v) => {
      const opt = question.options.find((o) => o.value === v);
      return opt ? opt.label : String(v);
    });
    return labels.length > 0 ? labels.join(", ") : "(none)";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const opt = question.options.find((o) => o.value === value);
  return opt ? opt.label : String(value);
}

/** Build the human-readable `form_answer` transcript body (plan §1.4 example). */
function buildTranscript(form: Form, answers: Record<string, unknown>): string {
  const lines: string[] = [`Answers to "${form.title}":`, ""];
  for (const q of form.questions) {
    const value = Object.prototype.hasOwnProperty.call(answers, q.key) ? answers[q.key] : undefined;
    lines.push(`- ${q.label}: ${renderAnswer(q, value)}`);
  }
  return lines.join("\n");
}

export function createFormService(deps: FormServiceDeps): FormService {
  const { forms, comments, attention, tickets, runs, emit, forwardComment } = deps;

  /** Broadcast a form lifecycle event on the per-ticket + project channels. */
  function emitForm(
    type: "form_created" | "form_submitted" | "form_dismissed",
    form: Form,
  ): void {
    const payload = { id: form.id, ticketId: form.ticketId, status: form.status };
    emit(CHANNELS.ticket(form.ticketId), type, payload);
    emit(CHANNELS.project, type, payload);
  }

  /** Broadcast an attention create/resolve on the attention + project channels. */
  function emitAttention(
    type: "attention_item_created" | "attention_item_resolved",
    item: { id: string },
    form: Form,
  ): void {
    const payload = {
      id: item.id,
      ticketId: form.ticketId,
      attentionType: "clarification_required",
      sourceType: "form",
      sourceId: form.id,
    };
    emit(CHANNELS.attention, type, payload);
    emit(CHANNELS.project, type, payload);
  }

  /** Broadcast a ticket block-status change on the per-ticket + project channels. */
  function emitTicketUpdated(ticketId: string, blockStatus: string): void {
    const payload = { id: ticketId, blockStatus };
    emit(CHANNELS.ticket(ticketId), "ticket_updated", payload);
    emit(CHANNELS.project, "ticket_updated", payload);
  }

  return {
    createForm(ticketId, input) {
      // Validate FIRST — a bad schema throws FormValidationError → 400 at the route.
      validateFormSchema(input);

      const author = agentAuthor(input.createdByAgentId);
      // 1. Create the `form` kind comment that surfaces the prompt in the stream.
      //    formId is backfilled below once the form row exists.
      const comment = comments.create(ticketId, {
        body: input.commentBody,
        author,
        metadata: { kind: "form" },
      });

      // 2. Create the form row (+ questions), linked to its comment.
      const form = forms.create({ ...input, ticketId, commentId: comment.id });

      // 3. Backfill the comment's metadata.formId now that we have the form id.
      const linkedComment = comments.setMetadata(comment.id, { formId: form.id });

      // 4. Open the clarification attention item (idempotent per source+type).
      const item = attention.open({
        attentionType: "clarification_required",
        sourceType: "form",
        sourceId: form.id,
        ticketId,
        runId: form.runId,
        priority: "high",
        title: form.title || "Clarification needed",
        summary: input.commentBody,
        requiredAction: "Submit answer",
      });

      // 5. Park the producing run (if any) at waiting_on_user_input FIRST. This must
      //    precede the ticket block: a DB trigger (`trg_agent_runs_unblock_ticket`,
      //    migration 0004) clears `block_status` to 'none' when a run enters
      //    waiting_on_user_input (run-driven unblock). The form's block (step 6)
      //    therefore must be the FINAL write so a blocking form wins (plan §1.3).
      if (form.runId && runs) {
        runs.setStatus(form.runId, "waiting_on_user_input");
      }

      // 6. Block the ticket if this form blocks it (block_status, not a new state).
      if (form.blocksTicket) {
        const ticket = tickets.get(ticketId);
        if (ticket && ticket.blockStatus !== "blocked") {
          tickets.setStatus(ticketId, ticket.status, "blocked");
        }
      }

      // 7. Broadcast (persist done above).
      emitForm("form_created", form);
      emitAttention("attention_item_created", item, form);
      if (form.blocksTicket) emitTicketUpdated(ticketId, "blocked");

      return { form, comment: linkedComment };
    },

    async submitForm(formId, input) {
      const form = forms.get(formId);
      if (!form) {
        throw new FormConflictError(`form "${formId}" not found`);
      }
      if (form.status !== "open") {
        throw new FormConflictError(`form "${formId}" is ${form.status}, expected open`);
      }

      const answers = input.answers ?? {};
      // Validate answers against the form's questions → 400 on failure.
      validateAnswers(form, answers);

      // Map validated answers → the repo's FormAnswer[] rows by matching question key.
      const rows: FormAnswer[] = form.questions
        .filter((q) => Object.prototype.hasOwnProperty.call(answers, q.key))
        .map((q) => ({
          id: "",
          formId: form.id,
          questionId: q.id,
          questionKey: q.key,
          answeredByUserId: input.answeredByUserId ?? null,
          value: answers[q.key],
          createdAt: "",
        }));

      // 1. Persist the structured answers (+ flips form → submitted).
      const submitted = forms.submit(form.id, rows);

      // 2. Create the human-readable `form_answer` transcript comment, marked for
      //    the agent so the forwarder resumes Claude with it.
      const transcript = comments.create(form.ticketId, {
        body: buildTranscript(submitted, answers),
        author: "user",
        metadata: { kind: "form_answer", formId: form.id, sendToAgent: true },
      });

      // 3. Resolve the clarification attention.
      const resolved = attention.resolveBySource("form", form.id, "clarification_required");

      // 4. Clear the ticket block if no other open blocking forms remain.
      let clearedBlock = false;
      const stillBlocking = forms.listOpenBlockingByTicket(form.ticketId);
      if (stillBlocking.length === 0) {
        const ticket = tickets.get(form.ticketId);
        if (ticket && ticket.blockStatus === "blocked") {
          tickets.setStatus(form.ticketId, ticket.status, "none");
          clearedBlock = true;
        }
      }

      // 5. Broadcast (persist done above).
      emitForm("form_submitted", submitted);
      if (resolved) emitAttention("attention_item_resolved", resolved, submitted);
      if (clearedBlock) emitTicketUpdated(form.ticketId, "none");

      // 6. Forward over the MIN-26 path — resumes the parked run. A forwarding
      //    failure must NOT lose the already-persisted answer (invariant §7).
      try {
        await forwardComment(transcript);
      } catch {
        // Swallowed: the answer + transcript are persisted; the forwarder records
        // its own audit/failure note on the run. Do not unwind the submission.
      }

      return { form: submitted, transcript };
    },

    dismissForm(formId, reason, byUserId) {
      const existing = forms.get(formId);
      if (!existing) {
        throw new FormConflictError(`form "${formId}" not found`);
      }
      if (existing.status !== "open") {
        throw new FormConflictError(`form "${formId}" is ${existing.status}, expected open`);
      }

      // 1. Dismiss (records who/why in the form description) → flips form → dismissed.
      const dismissed = forms.dismiss(formId, reason, byUserId);

      // 2. Resolve the clarification attention.
      const resolved = attention.resolveBySource("form", formId, "clarification_required");

      // 3. Recompute / clear the ticket block.
      let clearedBlock = false;
      const stillBlocking = forms.listOpenBlockingByTicket(dismissed.ticketId);
      if (stillBlocking.length === 0) {
        const ticket = tickets.get(dismissed.ticketId);
        if (ticket && ticket.blockStatus === "blocked") {
          tickets.setStatus(dismissed.ticketId, ticket.status, "none");
          clearedBlock = true;
        }
      }

      // 4. Broadcast.
      emitForm("form_dismissed", dismissed);
      if (resolved) emitAttention("attention_item_resolved", resolved, dismissed);
      if (clearedBlock) emitTicketUpdated(dismissed.ticketId, "none");

      return dismissed;
    },
  };
}
