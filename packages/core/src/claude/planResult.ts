/**
 * Planning-output parser (MIN-22, plan §2.4) — Impl-B.
 *
 * `parsePlanResult(text)` extracts the machine-readable plan block that Claude is
 * instructed to emit at the END of its final message:
 *
 *   <<<OTTER_PLAN>>>
 *   {"status":"PLAN_READY","title":"<short title>"}
 *   ---
 *   # <title>
 *   ...markdown body...
 *   <<<OTTER_PLAN_END>>>
 *
 * Rules (frozen §2.4):
 *  - Find the LAST `PLAN_MARKER_START … PLAN_MARKER_END` region (tolerant of
 *    surrounding whitespace / stray backticks). The last region wins because the
 *    earlier context may contain examples / quoted markers.
 *  - Split header line(s) from body on the FIRST `---` line inside the region.
 *  - Parse the header JSON. `PLAN_READY` → ready (title from header, else the first
 *    `# ` heading in the body, else ''). `PLAN_BLOCKED` → blocked (reason = body).
 *  - Missing region / bad JSON / empty body → error, with the raw input tail
 *    preserved (≤ {@link MAX_RAW_TAIL} chars) so nothing is silently dropped.
 *  - NEVER throws.
 */
import {
  PLAN_MARKER_START,
  PLAN_MARKER_END,
  type ParsedPlanResult,
  type PlanResultHeader,
} from "@otter/shared";

/** Cap on the raw tail preserved on an `error` result. */
const MAX_RAW_TAIL = 4000;

/** Tail of `text`, trimmed, capped at {@link MAX_RAW_TAIL} chars (for `error` results). */
function rawTail(text: string): string {
  return text.trim().slice(-MAX_RAW_TAIL);
}

/** Build the `error` result, preserving the raw input tail. */
function errorResult(text: string): ParsedPlanResult {
  return { kind: "error", raw: rawTail(text) };
}

/** Extract the body of the LAST marker region, or undefined if none is well-formed. */
function lastRegion(text: string): string | undefined {
  // Walk start markers from the end; pair each with the NEXT end marker after it.
  let searchFrom = text.length;
  for (;;) {
    const start = text.lastIndexOf(PLAN_MARKER_START, searchFrom);
    if (start === -1) return undefined;
    const afterStart = start + PLAN_MARKER_START.length;
    const end = text.indexOf(PLAN_MARKER_END, afterStart);
    if (end !== -1) {
      return text.slice(afterStart, end);
    }
    // This start has no matching end — keep looking at earlier starts.
    searchFrom = start - 1;
    if (searchFrom < 0) return undefined;
  }
}

/** First `# ` heading text in `markdown`, or '' if none. */
function firstHeading(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const match = /^\s*#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1] ?? "";
  }
  return "";
}

/** Parse the header JSON line(s) into a {@link PlanResultHeader}, or undefined. */
function parseHeader(headerText: string): PlanResultHeader | undefined {
  // Tolerate stray backticks / whitespace around the JSON object.
  const trimmed = headerText.trim().replace(/^`+|`+$/g, "").trim();
  if (trimmed.length === 0) return undefined;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (typeof value !== "object" || value === null) return undefined;
    const status = (value as { status?: unknown }).status;
    if (status !== "PLAN_READY" && status !== "PLAN_BLOCKED") return undefined;
    const titleRaw = (value as { title?: unknown }).title;
    const header: PlanResultHeader = { status };
    if (typeof titleRaw === "string") header.title = titleRaw;
    return header;
  } catch {
    return undefined;
  }
}

export function parsePlanResult(text: string): ParsedPlanResult {
  if (typeof text !== "string") return errorResult(String(text));

  const region = lastRegion(text);
  if (region === undefined) return errorResult(text);

  // Split header from body on the FIRST `---` line.
  const lines = region.split("\n");
  const dividerIdx = lines.findIndex((line) => line.trim() === "---");
  if (dividerIdx === -1) return errorResult(text);

  const headerText = lines.slice(0, dividerIdx).join("\n");
  const body = lines.slice(dividerIdx + 1).join("\n").trim();

  const header = parseHeader(headerText);
  if (header === undefined) return errorResult(text);

  if (header.status === "PLAN_READY") {
    if (body.length === 0) return errorResult(text);
    const title =
      header.title !== undefined && header.title.trim().length > 0
        ? header.title.trim()
        : firstHeading(body);
    return { kind: "ready", title, markdown: body };
  }

  // PLAN_BLOCKED — reason is the body (may be empty; blocked is still a valid outcome).
  return { kind: "blocked", reason: body };
}
