/**
 * Clarification-form domain contract (MIN-27, comment-context).
 *
 * Frozen, orchestrator-owned (plan 008 §2.1). The form repository, the form
 * lifecycle service, the form API, and the orchestrator agree on this shape.
 * `@otter/web` keeps its own local mirror so the browser bundle stays node-free.
 *
 * This module is node-free / browser-safe: it contains only constants, types,
 * and pure validators (no node imports). The validators throw a typed
 * {@link FormValidationError} so HTTP routes can map them to a 400.
 *
 * A form is NOT a source of truth on its own — it surfaces a structured
 * clarification request in the comment stream and (when blocking) parks the run
 * at `waiting_on_user_input` until answered.
 */

/** The five MVP question field types. */
export const FORM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "boolean",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Form lifecycle states. `open` is the sole active state (mirrors attention). */
export const FORM_STATUSES = [
  "open",
  "submitted",
  "dismissed",
  "expired",
  "superseded",
] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

/** Which agent phase asked the clarification (presentational + context). */
export const FORM_PHASES = ["planning", "execution", "verification", "manual"] as const;
export type FormPhase = (typeof FORM_PHASES)[number];

/** A choice for a single_select / multi_select question. */
export interface FormOption {
  label: string;
  value: string;
}

/** A single question on a form, camelCase domain shape (DB columns snake_case). */
export interface FormQuestion {
  id: string;
  formId: string;
  key: string;
  type: FormFieldType;
  label: string;
  helpText: string;
  required: boolean;
  options: FormOption[];
  defaultValue: unknown | null;
  sortOrder: number;
}

/** A stored answer to one question. */
export interface FormAnswer {
  id: string;
  formId: string;
  questionId: string;
  questionKey: string;
  answeredByUserId: string | null;
  value: unknown;
  createdAt: string;
}

/** A form row, hydrated with its questions and answers on read. */
export interface Form {
  id: string;
  projectId: string;
  ticketId: string;
  commentId: string;
  runId: string | null;
  status: FormStatus;
  phase: FormPhase;
  title: string;
  description: string;
  blocksTicket: boolean;
  createdByAgentId: string | null;
  createdAt: string;
  submittedAt: string | null;
  dismissedAt: string | null;
  /** Hydrated on read (ordered by sortOrder). */
  questions: FormQuestion[];
  /** Hydrated on read (creation order). */
  answers: FormAnswer[];
}

/** Input shape for one question when creating a form. */
export interface CreateFormQuestionInput {
  key: string;
  type: FormFieldType;
  label: string;
  helpText?: string;
  required?: boolean;
  options?: FormOption[];
  defaultValue?: unknown;
}

/** Input to create a form (the comment body carries the user-visible prompt). */
export interface CreateFormInput {
  runId?: string | null;
  phase: FormPhase;
  title: string;
  description?: string;
  blocksTicket?: boolean;
  commentBody: string;
  createdByAgentId?: string | null;
  questions: CreateFormQuestionInput[];
}

/** Input to submit answers to a form. Keys are question `key`s. */
export interface SubmitFormInput {
  answers: Record<string, unknown>;
  answeredByUserId?: string | null;
}

// --- Validation (pure; throws typed errors caught as 400 by routes) ---

/** Machine-usable validation failure codes. */
export const FORM_VALIDATION_CODES = [
  "empty_questions",
  "unsupported_field_type",
  "duplicate_key",
  "missing_key",
  "missing_label",
  "select_without_options",
  "required_missing",
  "select_not_in_options",
  "multi_not_array",
  "multi_unknown_option",
  "not_a_boolean",
] as const;
export type FormValidationCode = (typeof FORM_VALIDATION_CODES)[number];

/**
 * Thrown by {@link validateFormSchema} and {@link validateAnswers}. Carries a
 * machine-usable `code` (and optional offending question `key`) so HTTP routes
 * can map every failure to a 400 with a stable reason. Mirrors how the repos
 * throw plain Errors, but typed for the validation seam.
 */
export class FormValidationError extends Error {
  readonly code: FormValidationCode;
  readonly key: string | undefined;
  constructor(code: FormValidationCode, message: string, key?: string) {
    super(message);
    this.name = "FormValidationError";
    this.code = code;
    this.key = key;
  }
}

/** True when `value` is a member of {@link FORM_FIELD_TYPES}. */
export function isFormFieldType(value: unknown): value is FormFieldType {
  return typeof value === "string" && (FORM_FIELD_TYPES as readonly string[]).includes(value);
}

/** True when `value` is a member of {@link FORM_PHASES}. */
export function isFormPhase(value: unknown): value is FormPhase {
  return typeof value === "string" && (FORM_PHASES as readonly string[]).includes(value);
}

/**
 * Validate a form schema before creation. Rejects: no questions, unsupported
 * field types, missing/duplicate question keys, missing labels, and
 * single_select/multi_select with no options. Throws {@link FormValidationError}.
 */
export function validateFormSchema(input: CreateFormInput): void {
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new FormValidationError("empty_questions", "a form must have at least one question");
  }
  const seen = new Set<string>();
  for (const q of input.questions) {
    if (typeof q.key !== "string" || q.key.trim() === "") {
      throw new FormValidationError("missing_key", "each question needs a non-empty key");
    }
    if (seen.has(q.key)) {
      throw new FormValidationError("duplicate_key", `duplicate question key "${q.key}"`, q.key);
    }
    seen.add(q.key);
    if (!isFormFieldType(q.type)) {
      throw new FormValidationError(
        "unsupported_field_type",
        `unsupported field type "${String(q.type)}" for question "${q.key}"`,
        q.key,
      );
    }
    if (typeof q.label !== "string" || q.label.trim() === "") {
      throw new FormValidationError(
        "missing_label",
        `question "${q.key}" needs a non-empty label`,
        q.key,
      );
    }
    if (q.type === "single_select" || q.type === "multi_select") {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        throw new FormValidationError(
          "select_without_options",
          `question "${q.key}" is a ${q.type} but has no options`,
          q.key,
        );
      }
    }
  }
}

/**
 * Validate submitted answers against a form's questions. Enforces: required
 * questions present & non-empty; single_select value ∈ options; multi_select
 * values ⊆ options (and is an array); boolean is a real boolean. Throws
 * {@link FormValidationError}. Unknown answer keys are ignored.
 */
export function validateAnswers(form: Form, answers: Record<string, unknown>): void {
  const provided = answers ?? {};
  for (const q of form.questions) {
    const has = Object.prototype.hasOwnProperty.call(provided, q.key);
    const value = has ? provided[q.key] : undefined;
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);

    if (q.required && (!has || isEmpty)) {
      throw new FormValidationError(
        "required_missing",
        `required question "${q.key}" is missing or empty`,
        q.key,
      );
    }
    // Skip type checks for optional questions left blank.
    if (!has || isEmpty) continue;

    if (q.type === "single_select") {
      const allowed = q.options.map((o) => o.value);
      if (!allowed.includes(value as string)) {
        throw new FormValidationError(
          "select_not_in_options",
          `answer to "${q.key}" is not one of its options`,
          q.key,
        );
      }
    } else if (q.type === "multi_select") {
      if (!Array.isArray(value)) {
        throw new FormValidationError(
          "multi_not_array",
          `answer to "${q.key}" must be an array of option values`,
          q.key,
        );
      }
      const allowed = new Set(q.options.map((o) => o.value));
      for (const v of value) {
        if (!allowed.has(v as string)) {
          throw new FormValidationError(
            "multi_unknown_option",
            `answer to "${q.key}" contains an unknown option`,
            q.key,
          );
        }
      }
    } else if (q.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new FormValidationError(
          "not_a_boolean",
          `answer to "${q.key}" must be a boolean`,
          q.key,
        );
      }
    }
  }
}

// --- Claude output contract (mirror of OTTER_PLAN markers) ---

/** Markers delimiting the machine-readable form block in Claude's final message. */
export const FORM_MARKER_START = "<<<OTTER_FORM>>>";
export const FORM_MARKER_END = "<<<OTTER_FORM_END>>>";

/**
 * Result of parsing Claude's form output (never thrown — the parser returns
 * this discriminated-by-`found` shape, mirroring `ParsedPlanResult`). On parse
 * failure `raw` preserves the offending tail (≤4000 chars) for diagnostics.
 */
export interface ParsedFormResult {
  found: boolean;
  /** Normalized from the JSON body when parsing succeeds. */
  form?: CreateFormInput;
  /** Preserved tail on parse failure (≤4000). */
  raw?: string;
  error?: string;
}
