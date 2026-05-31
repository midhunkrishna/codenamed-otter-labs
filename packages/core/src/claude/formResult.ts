/**
 * Clarification-form output parser (MIN-27, plan §2.5) — Impl-B.
 *
 * `parseFormResult(text)` extracts the machine-readable form block that Claude is
 * instructed to emit at the END of its final message when it needs to ask the user
 * a structured clarification instead of guessing (the "ask, don't assume" policy):
 *
 *   <<<OTTER_FORM>>>
 *   { "phase":"planning", "title":"…", "blocksTicket":true,
 *     "commentBody":"…", "questions":[ { "key":"…", "type":"single_select", … } ] }
 *   <<<OTTER_FORM_END>>>
 *
 * Mirrors `parsePlanResult` exactly:
 *  - Find the LAST `FORM_MARKER_START … FORM_MARKER_END` region (the last region
 *    wins because earlier context may contain examples / quoted markers).
 *  - The region body is a single JSON object → normalized into a {@link CreateFormInput}.
 *  - The normalized input is validated with {@link validateFormSchema}; a schema
 *    failure is reported as `error` (NOT thrown) with the raw tail preserved.
 *  - Missing region / bad JSON / invalid schema → `{ found:false, error, raw }`,
 *    raw preserved (≤ {@link MAX_RAW_TAIL} chars) so nothing is silently dropped.
 *  - NEVER throws.
 */
import {
  FORM_MARKER_START,
  FORM_MARKER_END,
  validateFormSchema,
  FormValidationError,
  type CreateFormInput,
  type CreateFormQuestionInput,
  type ParsedFormResult,
} from "@otter/shared";

/** Cap on the raw tail preserved on an `error` result. */
const MAX_RAW_TAIL = 4000;

/** Tail of `text`, trimmed, capped at {@link MAX_RAW_TAIL} chars (for `error` results). */
function rawTail(text: string): string {
  return text.trim().slice(-MAX_RAW_TAIL);
}

/** Build a not-found / error result, preserving the raw input tail. */
function errorResult(text: string, error: string): ParsedFormResult {
  return { found: false, raw: rawTail(text), error };
}

/** Extract the body of the LAST marker region, or undefined if none is well-formed. */
function lastRegion(text: string): string | undefined {
  // Walk start markers from the end; pair each with the NEXT end marker after it.
  let searchFrom = text.length;
  for (;;) {
    const start = text.lastIndexOf(FORM_MARKER_START, searchFrom);
    if (start === -1) return undefined;
    const afterStart = start + FORM_MARKER_START.length;
    const end = text.indexOf(FORM_MARKER_END, afterStart);
    if (end !== -1) {
      return text.slice(afterStart, end);
    }
    // This start has no matching end — keep looking at earlier starts.
    searchFrom = start - 1;
    if (searchFrom < 0) return undefined;
  }
}

/** Coerce a raw JSON question object into a {@link CreateFormQuestionInput} shell. */
function normalizeQuestion(raw: unknown): CreateFormQuestionInput | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const q = raw as Record<string, unknown>;
  // We pass `type` through as-is (even if invalid) so validateFormSchema produces a
  // precise `unsupported_field_type` error rather than us masking it here.
  const out: CreateFormQuestionInput = {
    key: typeof q.key === "string" ? q.key : (q.key as never),
    type: q.type as CreateFormQuestionInput["type"],
    label: typeof q.label === "string" ? q.label : (q.label as never),
  };
  if (typeof q.helpText === "string") out.helpText = q.helpText;
  if (typeof q.required === "boolean") out.required = q.required;
  if (Array.isArray(q.options)) {
    out.options = q.options
      .map((o) => {
        if (typeof o !== "object" || o === null) return undefined;
        const opt = o as Record<string, unknown>;
        const value = typeof opt.value === "string" ? opt.value : String(opt.value ?? "");
        const label = typeof opt.label === "string" ? opt.label : value;
        return { label, value };
      })
      .filter((o): o is { label: string; value: string } => o !== undefined);
  }
  if ("defaultValue" in q) out.defaultValue = q.defaultValue;
  return out;
}

/** Build a {@link CreateFormInput} from a parsed JSON object, or undefined if shapeless. */
function normalizeForm(value: unknown): CreateFormInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.questions)) return undefined;
  const questions = v.questions
    .map(normalizeQuestion)
    .filter((q): q is CreateFormQuestionInput => q !== undefined);

  const form: CreateFormInput = {
    phase: v.phase as CreateFormInput["phase"],
    title: typeof v.title === "string" ? v.title : "",
    commentBody:
      typeof v.commentBody === "string"
        ? v.commentBody
        : typeof v.title === "string"
          ? v.title
          : "",
    questions,
  };
  if (typeof v.description === "string") form.description = v.description;
  if (typeof v.blocksTicket === "boolean") form.blocksTicket = v.blocksTicket;
  if (typeof v.runId === "string" || v.runId === null) form.runId = v.runId as string | null;
  if (typeof v.createdByAgentId === "string" || v.createdByAgentId === null) {
    form.createdByAgentId = v.createdByAgentId as string | null;
  }
  return form;
}

/**
 * Parse Claude's final message for an `OTTER_FORM` block. Never throws.
 * Returns `{ found:true, form }` on a valid, schema-passing block, else
 * `{ found:false, error, raw }`.
 */
export function parseFormResult(text: string): ParsedFormResult {
  if (typeof text !== "string") return errorResult(String(text), "input is not a string");

  const region = lastRegion(text);
  if (region === undefined) return { found: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(region.trim().replace(/^`+|`+$/g, "").trim());
  } catch {
    return errorResult(text, "form block is not valid JSON");
  }

  const form = normalizeForm(parsed);
  if (form === undefined) return errorResult(text, "form block is missing a questions array");

  try {
    validateFormSchema(form);
  } catch (err) {
    const message = err instanceof FormValidationError ? `${err.code}: ${err.message}` : "invalid form schema";
    return errorResult(text, message);
  }

  return { found: true, form };
}
