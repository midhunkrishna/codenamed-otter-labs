/**
 * Ticket context packet (MIN-20, plan §3i).
 *
 * `buildTicketContext` assembles a deterministic Markdown context document for a
 * single ticket, rebuilt purely from SQLite (no external state, no wall-clock
 * "now", no random ordering). Given identical DB state it returns byte-identical
 * output — comments and form answers are ordered by (created_at ASC, rowid ASC),
 * the same chronological ordering the comment repository uses.
 *
 * Two modes shape the trailing instructions:
 *  - "planning"  → includes an explicit "do NOT edit files" instruction and
 *                  deliberately EXCLUDES execution instructions; plans may be
 *                  listed but their content is not presented as something to run.
 *  - "execution" → includes execution instructions and presents the approved
 *                  plan content prominently.
 *
 * This module is read-only: it never writes to the database and has no network
 * or filesystem side effects.
 */
import type Database from "better-sqlite3";
import { createFormRepository } from "@otter/persistence";
import type { Form, FormAnswer, FormQuestion } from "@otter/shared";
import {
  HOW_TO_READ,
  INSTRUCTIONS_PREAMBLE,
  PLANNING_INSTRUCTIONS,
  EXECUTION_INSTRUCTIONS,
} from "./templates.js";

/** Which kind of context document to produce. */
export type ContextMode = "planning" | "execution";

/** Options for {@link buildTicketContext}. */
export interface BuildTicketContextOptions {
  mode: ContextMode;
  /** Absolute project root the (eventual) run operates within. */
  projectRoot: string;
  /** Optional extra constraints surfaced verbatim to the agent. */
  constraints?: string[];
}

/** Raw snake_case ticket row (subset this module reads). */
interface TicketRow {
  id: string;
  title: string;
  description: string;
  status: string;
  block_status: string;
}

/** Raw snake_case comment row (subset this module reads). */
interface CommentRow {
  id: string;
  author: string;
  body: string;
  metadata: string;
  created_at: string;
}

/** Raw snake_case plan row (subset this module reads). */
interface PlanRow {
  id: string;
  status: string;
  content: string;
  created_at: string;
}

/** Parsed shape of a comment's metadata JSON column. */
interface CommentMeta {
  kind?: unknown;
  [key: string]: unknown;
}

/** A normalized comment with its parsed metadata. */
interface ParsedComment {
  author: string;
  body: string;
  meta: CommentMeta;
}

/** Parse a metadata JSON string into a plain object, tolerating malformed input. */
function parseMeta(json: string): CommentMeta {
  try {
    const value = JSON.parse(json) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as CommentMeta;
    }
  } catch {
    // fall through to empty metadata
  }
  return {};
}

/** True when a string is present and non-empty after trimming. */
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Wrap UNTRUSTED user-supplied text in a fenced block so it is unambiguously DATA,
 * not instructions (prompt-injection containment, MIN-20 hardening). The fence is
 * one backtick longer than the longest backtick run in the text (CommonMark-safe),
 * so the content cannot break out of the block. Deterministic for identical input.
 */
export function fenceUntrusted(text: string): string {
  const runs = text.match(/`+/g);
  const longest = runs ? runs.reduce((max, run) => Math.max(max, run.length), 0) : 0;
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}\n${text}\n${ticks}`;
}

/** Render a `- Plan <id> (status: <status>)` bullet list. */
function planList(plans: PlanRow[]): string {
  return plans.map((p) => `- Plan ${p.id} (status: ${p.status})`).join("\n");
}

/** Header + identity block. */
function headerSection(ticket: TicketRow): string {
  return [
    `# ${ticket.title}`,
    "",
    `- Ticket ID: ${ticket.id}`,
    `- Status: ${ticket.status}`,
    `- Block status: ${ticket.block_status}`,
  ].join("\n");
}

/** Description (untrusted → fenced). */
function descriptionSection(ticket: TicketRow): string {
  const body = nonEmpty(ticket.description)
    ? fenceUntrusted(ticket.description)
    : "_No description._";
  return `## Description\n\n${body}`;
}

/** Conversation comments, chronological; each untrusted body fenced. */
function commentsSection(conversation: ParsedComment[]): string {
  if (conversation.length === 0) {
    return "## Comments\n\n_No comments._";
  }
  const entries = conversation.map((c) => {
    const author = nonEmpty(c.author) ? c.author : "unknown";
    return `**${author}:**\n${fenceUntrusted(c.body)}`;
  });
  return `## Comments\n\n${entries.join("\n\n")}`;
}

/** Render a single value (answer / default) as a fenced, deterministic string. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "_(no answer)_";
  if (typeof value === "string") {
    return value.trim().length > 0 ? fenceUntrusted(value) : "_(no answer)_";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "_(no answer)_";
    return fenceUntrusted(value.map((v) => String(v)).join(", "));
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return fenceUntrusted(String(value));
  }
  // Objects / anything else: stable JSON.
  return fenceUntrusted(JSON.stringify(value));
}

/**
 * Clarification Forms section, assembled deterministically from the forms tables
 * (form + questions + per-question answers). Oldest-first; each form gets a
 * status line and a Q/A list. All user/agent-supplied text is fenced as DATA.
 * Returns null when the ticket has no forms.
 */
function clarificationFormsSection(forms: Form[]): string | null {
  if (forms.length === 0) return null;

  const answersByQuestion = (form: Form): Map<string, FormAnswer> => {
    const map = new Map<string, FormAnswer>();
    for (const a of form.answers) map.set(a.questionId, a); // last write wins (createdAt ASC)
    return map;
  };

  const renderQuestion = (q: FormQuestion, answer: FormAnswer | undefined): string => {
    const required = q.required ? " (required)" : "";
    const lines = [`- **${q.key}**${required} [${q.type}]`];
    lines.push(`  - Q: ${fenceUntrusted(q.label)}`);
    if (answer !== undefined) {
      lines.push(`  - A: ${renderValue(answer.value)}`);
    } else {
      lines.push(`  - A: _(unanswered)_`);
    }
    return lines.join("\n");
  };

  const renderForm = (form: Form): string => {
    const blocks = form.blocksTicket ? ", blocks ticket" : "";
    const head = `### Form ${form.id} — ${fenceUntrusted(form.title)}`;
    const statusLine = `Status: ${form.status} (phase: ${form.phase}${blocks})`;
    const questions = [...form.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const answers = answersByQuestion(form);
    const qa =
      questions.length > 0
        ? questions.map((q) => renderQuestion(q, answers.get(q.id))).join("\n")
        : "_No questions._";
    return `${head}\n\n${statusLine}\n\n${qa}`;
  };

  return `## Clarification Forms\n\n${forms.map(renderForm).join("\n\n")}`;
}

/**
 * Plans section, mode-dependent. Planning mode lists plans by status only (never
 * presenting plan content as runnable); execution mode surfaces the approved plan
 * content prominently and lists the rest. Returns null when there are no plans.
 */
function plansSection(
  planRows: PlanRow[],
  approvedPlan: PlanRow | undefined,
  mode: ContextMode,
): string | null {
  if (planRows.length === 0) {
    return null;
  }
  if (mode === "planning") {
    return `## Plans\n\n${planList(planRows)}`;
  }
  const parts = ["## Plans"];
  if (approvedPlan) {
    const body = nonEmpty(approvedPlan.content)
      ? fenceUntrusted(approvedPlan.content)
      : "_Approved plan has no content._";
    parts.push(`### Approved plan\n\n${body}`);
  }
  const others = planRows.filter((p) => p !== approvedPlan);
  if (others.length > 0) {
    parts.push(`### Other plans\n\n${planList(others)}`);
  }
  return parts.join("\n\n");
}

/** Project root + optional constraints. */
function projectSection(opts: BuildTicketContextOptions): string {
  const lines = [`- Project root: ${opts.projectRoot}`];
  if (opts.constraints && opts.constraints.length > 0) {
    lines.push("- Constraints:");
    for (const constraint of opts.constraints) {
      lines.push(`  - ${constraint}`);
    }
  }
  return `## Project\n\n${lines.join("\n")}`;
}

/** Authoritative mode-specific instructions (overrides untrusted text above). */
function instructionsSection(mode: ContextMode): string {
  const body = mode === "planning" ? PLANNING_INSTRUCTIONS : EXECUTION_INSTRUCTIONS;
  return `${INSTRUCTIONS_PREAMBLE}\n\n${body}`;
}

/**
 * Build a deterministic Markdown context packet for `ticketId`.
 *
 * Returns the empty-but-valid document `# Ticket not found: <id>` if the ticket
 * does not exist (callers should generally check existence first; this keeps the
 * function total rather than throwing).
 */
export function buildTicketContext(
  db: Database.Database,
  ticketId: string,
  opts: BuildTicketContextOptions,
): string {
  const ticket = db
    .prepare(
      "SELECT id, title, description, status, block_status FROM ticket WHERE id = ?",
    )
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    return `# Ticket not found: ${ticketId}\n`;
  }

  // Comments — oldest first (mirrors listComments / comment repository ordering).
  const commentRows = db
    .prepare(
      "SELECT id, author, body, metadata, created_at FROM comment WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC",
    )
    .all(ticketId) as CommentRow[];
  const comments: ParsedComment[] = commentRows.map((row) => ({
    author: row.author,
    body: row.body,
    meta: parseMeta(row.metadata),
  }));

  // Plans — oldest first; deterministic ordering for listing and approval pick.
  const planRows = db
    .prepare(
      "SELECT id, status, content, created_at FROM plan WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC",
    )
    .all(ticketId) as PlanRow[];

  // Clarification forms (MIN-27): assembled from the forms tables (form +
  // questions + answers), NOT from comment metadata. The form repo hydrates
  // questions (sortOrder ASC) + answers (createdAt ASC); we list oldest-first so
  // the section is chronological and byte-deterministic.
  const forms = createFormRepository(db).listByTicket(ticketId).slice().reverse();

  // The oldest plan whose status is "approved" is the canonical approved plan.
  const approvedPlan = planRows.find((p) => p.status === "approved");

  // Comments — chronological. The `form` / `form_answer` kinds are presented in
  // the Clarification Forms section (and as a readable transcript), so they stay
  // in the conversation; only the legacy synthetic-form marker is excluded.
  const conversation = comments.filter((c) => c.meta.kind !== "form");

  // Assemble the document as an ordered list of section blocks. Each block is a
  // self-contained string with no leading/trailing blank lines; `null` entries
  // (sections that don't apply) are dropped. Joining with a blank line gives
  // deterministic spacing without per-line bookkeeping.
  const sections: Array<string | null> = [
    headerSection(ticket),
    HOW_TO_READ,
    descriptionSection(ticket),
    commentsSection(conversation),
    clarificationFormsSection(forms),
    plansSection(planRows, approvedPlan, opts.mode),
    projectSection(opts),
    instructionsSection(opts.mode),
  ];

  // Join blocks with a blank line and guarantee a single trailing newline.
  return `${sections.filter((s): s is string => s !== null).join("\n\n")}\n`;
}
