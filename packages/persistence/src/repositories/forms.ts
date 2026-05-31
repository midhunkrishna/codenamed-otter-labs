import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  DEFAULT_PROJECT_ID,
  type CreateFormInput,
  type Form,
  type FormAnswer,
  type FormOption,
  type FormPhase,
  type FormQuestion,
  type FormStatus,
} from "@otter/shared";

/** Raw snake_case `forms` row as stored in SQLite. */
interface FormRow {
  id: string;
  project_id: string;
  ticket_id: string;
  comment_id: string;
  run_id: string | null;
  status: string;
  phase: string;
  title: string;
  description: string;
  blocks_ticket: number;
  created_by_agent_id: string | null;
  created_at: string;
  submitted_at: string | null;
  dismissed_at: string | null;
}

/** Raw snake_case `form_questions` row. */
interface FormQuestionRow {
  id: string;
  form_id: string;
  question_key: string;
  question_type: string;
  label: string;
  help_text: string;
  required: number;
  options_json: string;
  default_value_json: string | null;
  sort_order: number;
}

/** Raw snake_case `form_answers` row. */
interface FormAnswerRow {
  id: string;
  form_id: string;
  question_id: string;
  question_key: string;
  answered_by_user_id: string | null;
  value_json: string;
  created_at: string;
}

/** Parse a JSON column, returning `fallback` on any malformed value. */
function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToQuestion(row: FormQuestionRow): FormQuestion {
  return {
    id: row.id,
    formId: row.form_id,
    key: row.question_key,
    type: row.question_type as FormQuestion["type"],
    label: row.label,
    helpText: row.help_text,
    required: row.required !== 0,
    options: parseJson<FormOption[]>(row.options_json, []),
    defaultValue: row.default_value_json === null ? null : parseJson<unknown>(row.default_value_json, null),
    sortOrder: row.sort_order,
  };
}

function rowToAnswer(row: FormAnswerRow): FormAnswer {
  return {
    id: row.id,
    formId: row.form_id,
    questionId: row.question_id,
    questionKey: row.question_key,
    answeredByUserId: row.answered_by_user_id ?? null,
    value: parseJson<unknown>(row.value_json, null),
    createdAt: row.created_at,
  };
}

export interface FormRepository {
  /** Create an `open` form with its questions (single transaction). */
  create(
    input: CreateFormInput & { ticketId: string; commentId: string; projectId?: string },
  ): Form;
  /** Get a form, hydrated with questions (sortOrder ASC) + answers (created ASC). */
  get(id: string): Form | undefined;
  /** Get a form by the `form` kind comment it is attached to. */
  getByComment(commentId: string): Form | undefined;
  /** All forms for a ticket, newest-first (hydrated). */
  listByTicket(ticketId: string): Form[];
  /** Open forms that block the ticket (`status='open' AND blocks_ticket=1`). */
  listOpenBlockingByTicket(ticketId: string): Form[];
  /**
   * Submit answers: insert answer rows + set status='submitted'+submitted_at,
   * in one transaction. Throws unless the form is currently `open`.
   */
  submit(id: string, answers: FormAnswer[]): Form;
  /**
   * Dismiss an open form (status='dismissed'+dismissed_at). The optional
   * `reason`/`byUserId` are recorded in the form's `description` as an appended
   * audit note (no schema change). Throws unless the form is currently `open`.
   */
  dismiss(id: string, reason?: string, byUserId?: string): Form;
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Clarification-form persistence (MIN-27). Owns the form lifecycle invariant:
 * `submit` and `dismiss` only act on an `open` form (idempotency / 409 in the
 * route layer). Forms are hydrated with their questions and answers on read.
 */
export function createFormRepository(db: Database.Database): FormRepository {
  const hydrate = (row: FormRow): Form => {
    const questionRows = db
      .prepare("SELECT * FROM form_questions WHERE form_id = ? ORDER BY sort_order ASC, rowid ASC")
      .all(row.id) as FormQuestionRow[];
    const answerRows = db
      .prepare("SELECT * FROM form_answers WHERE form_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(row.id) as FormAnswerRow[];
    return {
      id: row.id,
      projectId: row.project_id,
      ticketId: row.ticket_id,
      commentId: row.comment_id,
      runId: row.run_id ?? null,
      status: row.status as FormStatus,
      phase: row.phase as FormPhase,
      title: row.title,
      description: row.description,
      blocksTicket: row.blocks_ticket !== 0,
      createdByAgentId: row.created_by_agent_id ?? null,
      createdAt: row.created_at,
      submittedAt: row.submitted_at ?? null,
      dismissedAt: row.dismissed_at ?? null,
      questions: questionRows.map(rowToQuestion),
      answers: answerRows.map(rowToAnswer),
    };
  };

  const getRow = (id: string): FormRow | undefined =>
    db.prepare("SELECT * FROM forms WHERE id = ?").get(id) as FormRow | undefined;

  const get = (id: string): Form | undefined => {
    const row = getRow(id);
    return row ? hydrate(row) : undefined;
  };

  const requireOpen = (id: string): FormRow => {
    const row = getRow(id);
    if (!row) {
      throw new Error(`form "${id}" not found`);
    }
    if (row.status !== "open") {
      throw new Error(`form "${id}" is ${row.status}, expected open`);
    }
    return row;
  };

  return {
    create(input) {
      const id = randomUUID();
      const insert = db.transaction((): Form => {
        db.prepare(
          `INSERT INTO forms
             (id, project_id, ticket_id, comment_id, run_id, status, phase, title,
              description, blocks_ticket, created_by_agent_id, created_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ${NOW})`,
        ).run(
          id,
          input.projectId ?? DEFAULT_PROJECT_ID,
          input.ticketId,
          input.commentId,
          input.runId ?? null,
          input.phase,
          input.title,
          input.description ?? "",
          input.blocksTicket === false ? 0 : 1,
          input.createdByAgentId ?? null,
        );

        input.questions.forEach((q, index) => {
          db.prepare(
            `INSERT INTO form_questions
               (id, form_id, question_key, question_type, label, help_text, required,
                options_json, default_value_json, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            randomUUID(),
            id,
            q.key,
            q.type,
            q.label,
            q.helpText ?? "",
            (q.required ?? true) ? 1 : 0,
            JSON.stringify(q.options ?? []),
            q.defaultValue === undefined ? null : JSON.stringify(q.defaultValue),
            index,
          );
        });

        return get(id)!;
      });
      return insert();
    },

    get,

    getByComment(commentId) {
      const row = db
        .prepare("SELECT * FROM forms WHERE comment_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
        .get(commentId) as FormRow | undefined;
      return row ? hydrate(row) : undefined;
    },

    listByTicket(ticketId) {
      const rows = db
        .prepare("SELECT * FROM forms WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC")
        .all(ticketId) as FormRow[];
      return rows.map(hydrate);
    },

    listOpenBlockingByTicket(ticketId) {
      const rows = db
        .prepare(
          `SELECT * FROM forms
           WHERE ticket_id = ? AND status = 'open' AND blocks_ticket = 1
           ORDER BY created_at DESC, rowid DESC`,
        )
        .all(ticketId) as FormRow[];
      return rows.map(hydrate);
    },

    submit(id, answers) {
      requireOpen(id);
      const run = db.transaction((): Form => {
        for (const a of answers) {
          db.prepare(
            `INSERT INTO form_answers
               (id, form_id, question_id, question_key, answered_by_user_id, value_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ${NOW})`,
          ).run(
            a.id && a.id !== "" ? a.id : randomUUID(),
            id,
            a.questionId,
            a.questionKey,
            a.answeredByUserId ?? null,
            JSON.stringify(a.value ?? null),
          );
        }
        db.prepare(
          `UPDATE forms SET status = 'submitted', submitted_at = ${NOW} WHERE id = ?`,
        ).run(id);
        return get(id)!;
      });
      return run();
    },

    dismiss(id, reason, byUserId) {
      const row = requireOpen(id);
      // Record who/why on the form row (no schema change): append an audit note
      // to the description so a dismissed blocking form carries its rationale.
      const note =
        reason || byUserId
          ? `\n\n[dismissed${byUserId ? ` by ${byUserId}` : ""}${reason ? `: ${reason}` : ""}]`
          : "";
      const description = note ? `${row.description}${note}` : row.description;
      db.prepare(
        `UPDATE forms SET status = 'dismissed', dismissed_at = ${NOW}, description = ? WHERE id = ?`,
      ).run(description, id);
      return get(id)!;
    },
  };
}
