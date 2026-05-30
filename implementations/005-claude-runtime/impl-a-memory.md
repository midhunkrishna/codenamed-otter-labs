# Impl-A memory — Stream normalizer (core, pure) · plan 005 MIN-44

## 1. Files read & written

| Action | Path | Why |
|---|---|---|
| read | `plans/005-claude-runtime.md` | the contract (§3a union, §3d line shapes, §4 Impl-A scope) |
| read | `packages/shared/src/runs.ts` | RUN_EVENT_KINDS, AgentRun(Event) shapes |
| read | `packages/core/src/context/packet.ts` | tone / doc-comment conventions |
| read | `packages/core/src/claude.test.ts` | test conventions (vitest, `.js` ESM imports, fake-bin pattern) |
| read | `channels/005-claude-runtime-channel.log` | orchestrator kickoff |
| write | `packages/core/src/claude/types.ts` | FROZEN ClaudeRunEvent union + ClaudeRunner iface (verbatim §3a) |
| write | `packages/core/src/claude/streamParser.ts` | pure normalizer |
| write | `packages/core/src/claudeStream.test.ts` | vitest unit tests (TDD) |
| append | `channels/005-claude-runtime-channel.log` | posted contract for Impl-B |

## 2. What I implemented

- **`claude/types.ts`** — the frozen `ClaudeRunEvent` discriminated union and `ClaudeRunner`
  interface, copied verbatim from plan §3a. Other agents import this; do not edit without
  re-syncing the channel.
- **`claude/streamParser.ts`** — pure, deterministic, no DB/subprocess/execa/network, no
  wall-clock, no randomness, mutates nothing. Two exports:
  - `parseClaudeStreamLine(line, runId): ClaudeRunEvent[]` (the plan §3d signature; malformed →
    `[]`, no throw).
  - `parseClaudeStreamLineDetailed(line, runId): ParseResult` where
    `ParseResult = { events: ClaudeRunEvent[]; parseWarning?: string }`. **Impl-B consumes this
    one** so it can emit a `parse_warning` note from `parseWarning` (the raw line) while still
    applying `events`.
- **`claudeStream.test.ts`** — 11 vitest cases (all green).

## 3. Gist / learnings

### Real stream-json line shapes mapped
- `{"type":"system","subtype":"init","session_id":"…"}` → `claude.session_detected`. Other
  `system` subtypes → unrecognized → parseWarning.
- `{"type":"assistant","message":{"content":[…]}}` → iterate content blocks in order:
  - `{type:"text",text}` → `run.output.delta` (emits even empty-string text).
  - `{type:"tool_use",…}` → `run.tool_deferred` (the whole block passed through as `toolUse`).
  - unknown blocks (thinking/image) ignored.
  - missing/non-array `message.content` → unrecognized → parseWarning.
- `{"type":"result","subtype":"success","result":"…","session_id":"…"}` → emits
  `claude.session_detected` FIRST (if session_id present), THEN `run.structured_result`
  (value = `result`, passed verbatim). session_id optional.

### Malformed-line decision (key coordination point)
- Signature stays compatible with the plan: kept `parseClaudeStreamLine(...): ClaudeRunEvent[]`
  AND added the recommended detailed variant returning `{ events, parseWarning? }`.
- Rules: blank/whitespace line → `{ events: [] }` (NOT a warning). Non-JSON, valid-JSON-but-
  non-object, and recognized-object-with-unknown-`type` → `{ events: [], parseWarning: <raw line> }`.
- `JSON.parse` wrapped in try/catch → NEVER throws; raw line text preserved verbatim.

### Test command
`cd /Users/romeo/freeclaude/workspace/otter && npx vitest run packages/core/src/claudeStream.test.ts`
→ 11 passed. `tsc -p packages/core/tsconfig.json --noEmit` clean for my files.
