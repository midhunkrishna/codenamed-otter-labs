import { request } from "./client";

/** JSON-body helper (client.ts keeps its own private one; mirror it here). */
function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Forms API client (plan 008-comment-context §2.6 / §2.8). Mirrors the backend
 * form routes. Web stays node-free, so the @otter/shared `Form` shapes are
 * mirrored here (same pattern as api/attention.ts) rather than imported.
 */

export const FORM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "boolean",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_STATUSES = [
  "open",
  "submitted",
  "dismissed",
  "expired",
  "superseded",
] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_PHASES = [
  "planning",
  "execution",
  "verification",
  "manual",
] as const;
export type FormPhase = (typeof FORM_PHASES)[number];

export interface FormOption {
  label: string;
  value: string;
}

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

export interface FormAnswer {
  id: string;
  formId: string;
  questionId: string;
  questionKey: string;
  answeredByUserId: string | null;
  value: unknown;
  createdAt: string;
}

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
  questions: FormQuestion[];
  answers: FormAnswer[];
}

/** Answers keyed by question.key (mirrors SubmitFormInput.answers). */
export type FormAnswerMap = Record<string, unknown>;

export interface TranscriptComment {
  id: string;
  ticketId: string;
  author: string;
  body: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

// NOTE: `request()` already prepends API_PREFIX ("/api"), so paths here are
// relative to it (mirrors api/plans.ts / api/attention.ts).

/** GET /api/tickets/:ticketId/forms -> Form[] */
export async function listTicketForms(ticketId: string): Promise<Form[]> {
  return request<Form[]>(`/tickets/${ticketId}/forms`);
}

/** GET /api/forms/:formId -> Form */
export async function getForm(formId: string): Promise<Form> {
  return request<Form>(`/forms/${formId}`);
}

/** POST /api/forms/:formId/submit -> { form, transcript } */
export async function submitForm(
  formId: string,
  input: { answers: FormAnswerMap; answeredByUserId?: string | null },
): Promise<{ form: Form; transcript: TranscriptComment }> {
  return request<{ form: Form; transcript: TranscriptComment }>(
    `/forms/${formId}/submit`,
    jsonBody("POST", input),
  );
}

/** POST /api/forms/:formId/dismiss -> { form } */
export async function dismissForm(
  formId: string,
  reason?: string,
): Promise<{ form: Form }> {
  return request<{ form: Form }>(
    `/forms/${formId}/dismiss`,
    jsonBody("POST", reason ? { reason } : {}),
  );
}
