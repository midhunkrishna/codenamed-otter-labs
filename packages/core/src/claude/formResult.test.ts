/**
 * `parseFormResult` tests (MIN-27, plan §2.5) — Impl-B. Pure parser, mirrors
 * `planResult.test.ts`: happy path, last-region-wins, malformed JSON, missing
 * questions, schema-invalid block, and no-marker (found:false, no error).
 */
import { describe, expect, it } from "vitest";
import { FORM_MARKER_START, FORM_MARKER_END } from "@otter/shared";
import { parseFormResult } from "./formResult.js";

function block(json: string): string {
  return `${FORM_MARKER_START}\n${json}\n${FORM_MARKER_END}`;
}

const VALID = JSON.stringify({
  phase: "planning",
  title: "OAuth provider",
  commentBody: "Which provider?",
  blocksTicket: true,
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
  ],
});

describe("parseFormResult", () => {
  it("parses a valid OTTER_FORM block into a normalized CreateFormInput", () => {
    const res = parseFormResult(`Here is my question.\n\n${block(VALID)}`);
    expect(res.found).toBe(true);
    expect(res.form?.phase).toBe("planning");
    expect(res.form?.title).toBe("OAuth provider");
    expect(res.form?.questions).toHaveLength(1);
    expect(res.form?.questions[0]?.type).toBe("single_select");
    expect(res.error).toBeUndefined();
  });

  it("last region wins (ignores an earlier example block)", () => {
    const earlier = block(JSON.stringify({ phase: "planning", title: "OLD", commentBody: "x", questions: [] }));
    const res = parseFormResult(`${earlier}\n\nactually:\n${block(VALID)}`);
    expect(res.found).toBe(true);
    expect(res.form?.title).toBe("OAuth provider");
  });

  it("no marker → found:false with NO error (caller falls through to the plan path)", () => {
    const res = parseFormResult("Just a normal plan, no form here.");
    expect(res.found).toBe(false);
    expect(res.error).toBeUndefined();
    expect(res.form).toBeUndefined();
  });

  it("malformed JSON → found:false WITH error + raw tail preserved", () => {
    const res = parseFormResult(block("{not valid json"));
    expect(res.found).toBe(false);
    expect(res.error).toMatch(/not valid JSON/);
    expect(typeof res.raw).toBe("string");
  });

  it("missing questions array → found:false with error", () => {
    const res = parseFormResult(block(JSON.stringify({ phase: "planning", title: "T", commentBody: "?" })));
    expect(res.found).toBe(false);
    expect(res.error).toMatch(/questions array/);
  });

  it("schema-invalid block (unsupported field type) → found:false, error carries the code", () => {
    const bad = block(
      JSON.stringify({
        phase: "planning",
        title: "T",
        commentBody: "?",
        questions: [{ key: "q", type: "date", label: "When" }],
      }),
    );
    const res = parseFormResult(bad);
    expect(res.found).toBe(false);
    expect(res.error).toMatch(/unsupported_field_type/);
  });

  it("never throws on non-string input", () => {
    expect(() => parseFormResult(undefined as never)).not.toThrow();
    expect(parseFormResult(undefined as never).found).toBe(false);
  });
});
