/**
 * parsePlanResult tests (MIN-22, plan §2.4) — Impl-B.
 *
 * Pure parser, no I/O. Covers PLAN_READY (+ title fallback to the first heading),
 * PLAN_BLOCKED, missing/garbled markers (→ error with the raw tail preserved), and
 * the last-region-wins rule (earlier example blocks are ignored).
 */
import { describe, expect, it } from "vitest";
import { PLAN_MARKER_START, PLAN_MARKER_END } from "@otter/shared";
import { parsePlanResult } from "./planResult.js";

/** Wrap header JSON + body in the OTTER_PLAN markers. */
function block(header: string, body: string): string {
  return `${PLAN_MARKER_START}\n${header}\n---\n${body}\n${PLAN_MARKER_END}`;
}

describe("parsePlanResult", () => {
  it("PLAN_READY → ready with header title + trimmed markdown body", () => {
    const text = `Here is my plan.\n\n${block(
      '{"status":"PLAN_READY","title":"Add login"}',
      "# Add login\n\n## Summary\nDo the thing.\n",
    )}`;
    const result = parsePlanResult(text);
    expect(result).toEqual({
      kind: "ready",
      title: "Add login",
      markdown: "# Add login\n\n## Summary\nDo the thing.",
    });
  });

  it("PLAN_READY with no header title falls back to the first '# ' heading", () => {
    const text = block('{"status":"PLAN_READY"}', "# Derived Title\n\nbody");
    const result = parsePlanResult(text);
    expect(result).toEqual({
      kind: "ready",
      title: "Derived Title",
      markdown: "# Derived Title\n\nbody",
    });
  });

  it("PLAN_READY with neither header title nor heading → title ''", () => {
    const text = block('{"status":"PLAN_READY"}', "just prose, no heading");
    const result = parsePlanResult(text);
    expect(result).toMatchObject({ kind: "ready", title: "" });
  });

  it("PLAN_BLOCKED → blocked with the body as the reason", () => {
    const text = block('{"status":"PLAN_BLOCKED"}', "Need the API key first.");
    expect(parsePlanResult(text)).toEqual({ kind: "blocked", reason: "Need the API key first." });
  });

  it("missing markers → error, raw input preserved", () => {
    const text = "I could not produce a plan today.";
    const result = parsePlanResult(text);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.raw).toContain("could not produce");
  });

  it("garbled header JSON → error, raw preserved", () => {
    const text = block("{not json}", "# Title\nbody");
    const result = parsePlanResult(text);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.raw).toContain("not json");
  });

  it("PLAN_READY with an empty body → error (nothing to store)", () => {
    const text = block('{"status":"PLAN_READY","title":"x"}', "   ");
    expect(parsePlanResult(text).kind).toBe("error");
  });

  it("last marker region wins (earlier example block ignored)", () => {
    const example = block('{"status":"PLAN_BLOCKED"}', "this is just an example");
    const real = block('{"status":"PLAN_READY","title":"Real"}', "# Real\nthe actual plan");
    const text = `Example of the format:\n${example}\n\nMy answer:\n${real}`;
    expect(parsePlanResult(text)).toMatchObject({ kind: "ready", title: "Real" });
  });

  it("tolerates stray backticks / whitespace around the header JSON", () => {
    const text = `${PLAN_MARKER_START}\n  \`{"status":"PLAN_READY","title":"T"}\`  \n---\n# T\nbody\n${PLAN_MARKER_END}`;
    expect(parsePlanResult(text)).toMatchObject({ kind: "ready", title: "T" });
  });

  it("caps the preserved raw tail at 4000 chars", () => {
    const text = "x".repeat(5000);
    const result = parsePlanResult(text);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.raw.length).toBe(4000);
  });

  it("never throws on non-string input", () => {
    expect(parsePlanResult(undefined as unknown as string).kind).toBe("error");
  });
});
