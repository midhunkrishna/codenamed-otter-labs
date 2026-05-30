/**
 * Pure Claude Code `stream-json` line normalizer (MIN-44, plan §3d / Impl-A).
 *
 * `parseClaudeStreamLine(line, runId)` turns a single line of Claude Code's
 * headless `--output-format stream-json` stdout into 0..n {@link ClaudeRunEvent}s.
 * It is **pure**: no DB, no subprocess, no execa, no network, no wall-clock, no
 * randomness, and it mutates nothing. Given the same input it returns the same
 * output, so it is trivially unit-testable apart from the runner that drives it.
 *
 * Line shapes targeted (plan §3d):
 *   - {"type":"system","subtype":"init","session_id":"…"}        → claude.session_detected
 *   - {"type":"assistant","message":{"content":[{type:"text",…},{type:"tool_use",…}]}}
 *                                                                 → one run.output.delta per
 *                                                                   text block + one
 *                                                                   run.tool_deferred per tool_use
 *   - {"type":"result","subtype":"success","result":"…","session_id":"…"}
 *                                                                 → run.structured_result
 *                                                                   (+ claude.session_detected if a
 *                                                                    session id appears here)
 *   - blank / whitespace-only line                                → []
 *   - non-JSON / unparseable / unknown shape                      → [] from the array helper, and
 *                                                                   a `parseWarning` from the
 *                                                                   detailed helper (raw preserved)
 *
 * Malformed JSON NEVER throws — the raw line text is preserved in `parseWarning`
 * (which the caller maps to a `note {kind:"parse_warning", raw}`, plan §3b).
 *
 * SIGNATURE CHOICE (documented for Impl-B):
 *   - `parseClaudeStreamLine(line, runId): ClaudeRunEvent[]`  — the plan signature.
 *     Use for the happy path; malformed/unknown lines yield `[]` (no warning surfaced).
 *   - `parseClaudeStreamLineDetailed(line, runId): ParseResult` — RECOMMENDED for the
 *     runner. Same normalized `events`, PLUS `parseWarning` (the raw line text) when the
 *     line could not be parsed or its shape was unrecognized. Impl-B should consume
 *     THIS one so it can emit a parse_warning note and still preserve raw output.
 */
import type { ClaudeRunEvent } from "./types.js";

/** Result of {@link parseClaudeStreamLineDetailed}: normalized events + optional raw warning. */
export interface ParseResult {
  /** Zero or more normalized driver events derived from the line. */
  events: ClaudeRunEvent[];
  /** Present only when the line was malformed/unrecognized; carries the raw line text. */
  parseWarning?: string;
}

/** Narrow an unknown to a plain object (not null, not array). */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty string guard. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Normalize a single stream-json line, surfacing a `parseWarning` (the raw line)
 * for blank-but-no, malformed, or unrecognized lines.
 *
 * - A blank / whitespace-only line is NOT a warning: it returns `{ events: [] }`.
 * - A line that is not valid JSON, or whose parsed shape we do not recognize,
 *   returns `{ events: [], parseWarning: <raw line> }` and never throws.
 */
export function parseClaudeStreamLineDetailed(line: string, runId: string): ParseResult {
  // Blank lines are normal framing between JSON objects — silently ignored.
  if (line.trim().length === 0) {
    return { events: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Malformed JSON: never throw, preserve the raw line for a parse_warning note.
    return { events: [], parseWarning: line };
  }

  if (!isObject(parsed)) {
    // Valid JSON but not an object (e.g. a bare number / string / array) — unknown shape.
    return { events: [], parseWarning: line };
  }

  const type = parsed.type;

  if (type === "system") {
    // system/init carries the Claude session id we resume with later.
    if (parsed.subtype === "init" && isNonEmptyString(parsed.session_id)) {
      return {
        events: [{ type: "claude.session_detected", runId, claudeSessionId: parsed.session_id }],
      };
    }
    // Other system subtypes are not (yet) meaningful to the runtime.
    return { events: [], parseWarning: line };
  }

  if (type === "assistant") {
    return parseAssistant(parsed, runId, line);
  }

  if (type === "result") {
    return parseResult(parsed, runId);
  }

  // Recognized JSON object but an unknown `type` (or no type) — preserve raw.
  return { events: [], parseWarning: line };
}

/**
 * Assistant message → one `run.output.delta` per text block and one
 * `run.tool_deferred` per tool_use block, in content order. Other block kinds
 * are skipped. An assistant line whose `message.content` is missing/not an array
 * is an unrecognized shape → parse_warning.
 */
function parseAssistant(
  parsed: Record<string, unknown>,
  runId: string,
  line: string,
): ParseResult {
  const message = parsed.message;
  if (!isObject(message) || !Array.isArray(message.content)) {
    return { events: [], parseWarning: line };
  }

  const events: ClaudeRunEvent[] = [];
  for (const block of message.content) {
    if (!isObject(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      // Emit even empty text deltas faithfully (the model may stream "").
      events.push({ type: "run.output.delta", runId, text: block.text });
    } else if (block.type === "tool_use") {
      // Defer the whole tool_use block; the runner records it as a permission request.
      events.push({ type: "run.tool_deferred", runId, toolUse: block });
    }
    // Unknown block kinds (thinking, image, …) are ignored for MVP.
  }

  return { events };
}

/**
 * result/* → `run.structured_result` carrying the `result` value, plus a
 * `claude.session_detected` when the result line surfaces a session id. The
 * session event is emitted first so the runner captures the id before recording
 * the structured result.
 */
function parseResult(parsed: Record<string, unknown>, runId: string): ParseResult {
  const events: ClaudeRunEvent[] = [];

  if (isNonEmptyString(parsed.session_id)) {
    events.push({ type: "claude.session_detected", runId, claudeSessionId: parsed.session_id });
  }

  // `result` is the structured payload (string on success); pass it through verbatim.
  events.push({ type: "run.structured_result", runId, value: parsed.result });

  return { events };
}

/**
 * Pure normalizer (plan §3d signature): a single stream-json line → 0..n
 * {@link ClaudeRunEvent}s. Malformed / unknown lines yield `[]` (no throw). Use
 * {@link parseClaudeStreamLineDetailed} when you also need the raw text of an
 * unparseable line to emit a parse_warning.
 */
export function parseClaudeStreamLine(line: string, runId: string): ClaudeRunEvent[] {
  return parseClaudeStreamLineDetailed(line, runId).events;
}
