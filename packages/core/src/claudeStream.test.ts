/**
 * Pure stream-json normalizer tests (MIN-44, plan §3d / Impl-A).
 *
 * Each real Claude Code `stream-json` line shape → expected normalized
 * {@link ClaudeRunEvent}s. No subprocess, no DB — these exercise the pure parser
 * only. Malformed lines must NEVER throw and must preserve the raw line text.
 */
import { describe, expect, it } from "vitest";
import {
  parseClaudeStreamLine,
  parseClaudeStreamLineDetailed,
} from "./claude/streamParser.js";

const RUN_ID = "run_abc";

describe("parseClaudeStreamLine (MIN-44 §3d)", () => {
  it("system/init → claude.session_detected with the session id", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "sess_123",
    });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "claude.session_detected", runId: RUN_ID, claudeSessionId: "sess_123" },
    ]);
  });

  it("assistant text block → run.output.delta carrying the text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello world" }] },
    });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "run.output.delta", runId: RUN_ID, text: "Hello world" },
    ]);
  });

  it("assistant tool_use block → run.tool_deferred carrying the whole block", () => {
    const toolUse = {
      type: "tool_use",
      id: "tool_1",
      name: "Bash",
      input: { command: "ls" },
    };
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [toolUse] },
    });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "run.tool_deferred", runId: RUN_ID, toolUse },
    ]);
  });

  it("multi-content assistant message → one event per block, in order", () => {
    const toolUse = { type: "tool_use", id: "t2", name: "Read", input: { file: "a.ts" } };
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "first" },
          toolUse,
          { type: "text", text: "second" },
        ],
      },
    });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "run.output.delta", runId: RUN_ID, text: "first" },
      { type: "run.tool_deferred", runId: RUN_ID, toolUse },
      { type: "run.output.delta", runId: RUN_ID, text: "second" },
    ]);
  });

  it("result/success → run.structured_result plus claude.session_detected (session first)", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "done: 3 files changed",
      session_id: "sess_456",
    });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "claude.session_detected", runId: RUN_ID, claudeSessionId: "sess_456" },
      { type: "run.structured_result", runId: RUN_ID, value: "done: 3 files changed" },
    ]);
  });

  it("result with no session_id → only run.structured_result", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", result: "ok" });
    expect(parseClaudeStreamLine(line, RUN_ID)).toEqual([
      { type: "run.structured_result", runId: RUN_ID, value: "ok" },
    ]);
  });

  it("blank line → [] (and no parse warning)", () => {
    expect(parseClaudeStreamLine("", RUN_ID)).toEqual([]);
    expect(parseClaudeStreamLine("   \t  ", RUN_ID)).toEqual([]);
    expect(parseClaudeStreamLineDetailed("", RUN_ID)).toEqual({ events: [] });
  });

  it("malformed / garbage line → no throw, [] events, raw preserved in parseWarning", () => {
    const garbage = "{not valid json at all";
    expect(() => parseClaudeStreamLine(garbage, RUN_ID)).not.toThrow();
    expect(parseClaudeStreamLine(garbage, RUN_ID)).toEqual([]);

    const detailed = parseClaudeStreamLineDetailed(garbage, RUN_ID);
    expect(detailed.events).toEqual([]);
    expect(detailed.parseWarning).toBe(garbage);
  });

  it("valid JSON but non-object (bare value) → parseWarning, no events", () => {
    const detailed = parseClaudeStreamLineDetailed("42", RUN_ID);
    expect(detailed.events).toEqual([]);
    expect(detailed.parseWarning).toBe("42");
  });

  it("known JSON object with an unrecognized type → parseWarning, no events", () => {
    const line = JSON.stringify({ type: "mystery", foo: "bar" });
    const detailed = parseClaudeStreamLineDetailed(line, RUN_ID);
    expect(detailed.events).toEqual([]);
    expect(detailed.parseWarning).toBe(line);
  });

  it("detailed: happy-path line surfaces events and NO parseWarning", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hi" }] },
    });
    const detailed = parseClaudeStreamLineDetailed(line, RUN_ID);
    expect(detailed.events).toEqual([
      { type: "run.output.delta", runId: RUN_ID, text: "hi" },
    ]);
    expect(detailed.parseWarning).toBeUndefined();
  });
});
