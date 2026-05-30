# Plan 005 — Claude Runtime (MIN-44) + tone cleanup (D-003-3)

> **Theme:** `claude-runtime`. Branch `claude-runtime` (off `master`).
> **Tickets:** MIN-44 `[claude-runtime] Implement Claude Code subprocess driver`
> (absorbs deferred **D-004-1**). Also absorbs deferred **D-003-3** (vanilla-extract
> `assignInlineVars` cleanup) as an independent web-package work-stream.
> **Pattern:** actor.agent — orchestrator + parallel implementors, channel log at
> `channels/005-claude-runtime-channel.log`, per-agent memory under
> `implementations/005-claude-runtime/`.

---

## 1. Goal

Build the **real executor** that plan 004 deliberately left out: a Node subprocess
driver that invokes Claude Code headless, streams its `stream-json` stdout, normalizes
each line into internal run events, **persists each event before broadcasting it**,
captures the Claude session id for resume, and supports cancel. Plus a minimal
`POST /api/runs/:id/start` so the driver is exercisable end-to-end (the automatic
"start on plannable" trigger remains MIN-21, out of scope).

This plugs into the seam plan 004 froze:
`runEvents.append(runId, kind, payload)` → then `emit(channel, type, RunEventPayload)`.
**SQLite is the source of truth; the Claude process memory is not.**

---

## 2. Invariants (from MIN-44 — non-negotiable)

1. SQLite remains source of truth for runs and events; Claude process memory is not.
2. Every emitted driver event is **persisted before** it is broadcast over WebSocket.
3. A failed/crashing Claude process must **not crash the Otter server** (driver never rejects to the event loop; failures become `failed` runs).
4. Cancellation is **explicit** and recorded as a run event (`status_changed → canceled`).
5. Driver **never runs outside** the configured project root (`cwd = projectRoot`).
6. Driver must **not swallow stderr** — stderr is captured to run events + debug log.
7. If `stream-json` line parsing fails, **raw output is still preserved** (+ a parse-warning note).
8. The runner is **testable with a fake Claude binary** (no real install needed) — reuse the `OTTER_CLAUDE_BIN` + temp-script pattern already in `runtime.test.ts`.

---

## 3. Frozen contracts (orchestrator-owned — implementors build against these)

### 3a. Normalized driver event — `packages/core/src/claude/types.ts` (NEW)

```ts
export type ClaudeRunEvent =
  | { type: "run.started";            runId: string }
  | { type: "claude.session_detected"; runId: string; claudeSessionId: string }
  | { type: "run.output.delta";       runId: string; text: string }
  | { type: "run.structured_result";  runId: string; value: unknown }
  | { type: "run.tool_deferred";      runId: string; toolUse: unknown }
  | { type: "run.completed";          runId: string }
  | { type: "run.failed";             runId: string; error: string };

export interface ClaudeRunner {
  startPlanningRun(input:  { runId: string; projectRoot: string; contextMarkdown: string }): Promise<void>;
  startExecutionRun(input: { runId: string; projectRoot: string; contextMarkdown: string }): Promise<void>;
  resumeRun(input: { runId: string; projectRoot: string; claudeSessionId: string; promptMarkdown: string }): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}
```

### 3b. Persistence/broadcast mapping (`ClaudeRunEvent` → existing seams) — FROZEN

The driver receives an injected **sink** (built by the factory) and never touches the DB
or bus directly. Mapping from normalized event → `runEvents.append(kind, payload)` (frozen
`RUN_EVENT_KINDS`) and → `emit(channel, EventType, RunEventPayload)`:

| ClaudeRunEvent | append kind | payload | bus EventType | channels |
|---|---|---|---|---|
| `run.started` | `status_changed` | `{from, to:"running"}` (+ `runs.setStatus(running)`) | `run_status_changed` | `run:<id>` + `project` |
| `claude.session_detected` | `note` | `{kind:"claude_session", claudeSessionId}` | — (no broadcast) | — |
| `run.output.delta` | `output_delta` | `{text}` | `run_output_delta` | `run:<id>` |
| `run.structured_result` | `note` | `{kind:"structured_result", value}` | `run_output_delta` (optional) | `run:<id>` |
| `run.tool_deferred` | `permission_requested` | `{toolUse}` | `permission_requested` | `run:<id>` + `approvals` |
| `run.completed` | `status_changed` | `{from:"running", to:"completed"}` (+ `setStatus(completed)`) | `run_status_changed` | `run:<id>` + `project` |
| `run.failed` | `status_changed` | `{from, to:"failed"}` + a `log` event `{message}` (+ `setStatus(failed)`) | `run_status_changed` | `run:<id>` + `project` |
| malformed line | `note` | `{kind:"parse_warning", raw}` | — | — |
| stderr chunk | `log` | `{stream:"stderr", message}` | — | — |

**`RunEventPayload` (frozen in `@otter/shared`):** broadcasts MUST carry `{ id, runId, seq, text? }`
where `id` = the just-persisted `agent_run_event.id` (the dedupe key). **Persist → read back
id/seq → broadcast.** Never broadcast without the persisted id.

### 3c. Runner factory — `packages/core/src/claude/runner.ts` (NEW)

```ts
export interface RunnerDeps {
  append: (runId: string, kind: RunEventKind, payload?: Record<string, unknown>) => AgentRunEvent;
  emit?: Emit;                       // MIN-17 bus hook (persist-before-broadcast)
  setRunStatus: (id: string, status: RunStatus) => AgentRun | undefined;
  getRun: (id: string) => AgentRun | undefined;
  logsDir: string;                   // <dataDir>/logs/runs
  claudeBin?: string;                // defaults to resolveClaudeBin() (OTTER_CLAUDE_BIN → "claude")
}
export function createClaudeCodeSubprocessRunner(deps: RunnerDeps): ClaudeRunner;
```

### 3d. Claude CLI invocation (headless / stream-json) — target the real CLI

- Planning/execution: `claude -p --output-format stream-json --verbose` with the
  context markdown piped to **stdin** (avoids arg-length limits), `cwd = projectRoot`.
- Resume: add `--resume <claudeSessionId>`, prompt markdown on stdin.
- stdout parsed **line-by-line**. Real stream-json line shapes the parser targets:
  - `{"type":"system","subtype":"init","session_id":"…"}` → `claude.session_detected`
  - `{"type":"assistant","message":{"content":[{"type":"text","text":"…"}, {"type":"tool_use",…}]}}` → `output.delta` (text) / `tool_deferred` (tool_use)
  - `{"type":"result","subtype":"success","result":"…","session_id":"…"}` → `structured_result` (+ session if newly seen)
  - any non-JSON / unknown line → preserve raw (`parse_warning`)
- Exit 0 → `run.completed`. Non-zero exit / signal → `run.failed` (error includes code/signal + tail of stderr).
- Spawn via **execa** (new `@otter/core` dependency). Cancel = `child.kill()` (SIGTERM, then SIGKILL fallback). Debug log (raw stdout+stderr) appended under `<dataDir>/logs/runs/<runId>.log`.

### 3e. Start endpoint — `POST /api/runs/:id/start` (in `runtime/routes.ts`)

- 404 if run missing. 409 if run already terminal or already running.
- Re-check Claude readiness (`getCachedClaudeStatus`) for planning/execution; if not ready → mark `failed` + log event (same shape as create-guard), return 409/200 with the failed run.
- Build context via `buildTicketContext(db, run.ticketId, { mode, projectRoot })` (mode from run.type: planning→"planning", execution→"execution"). Manual/review: minimal/no context for MVP.
- Fire-and-forget `runner.startPlanningRun|startExecutionRun(...)` (do NOT await completion in the request — return 202 with the run; live events flow over WS). The runner drives the run to terminal state asynchronously.
- The runner instance + `projectRoot` are constructed once in `registerRuntimeHttpRoutes` (or threaded from `server.ts`) and reused.

### 3f. D-003-3 (web) — FROZEN scope

- Add `@vanilla-extract/dynamic` to `packages/web` deps (match `@vanilla-extract/*` major = 4.x).
- Replace `inlineVars()` in `ui/tone.ts` with a re-export/wrapper over `assignInlineVars`
  (same call sites: `Card.tsx`, `Pill.tsx`, `Badge.tsx` keep calling `inlineVars(entries)` —
  swap the body to `assignInlineVars(entries)`, or replace the import). No behavior change,
  no visual change. Delete the `unwrapVar` shim once unused. Web tests + typecheck stay green.

---

## 4. Parallel split (3 implementors)

Two work-streams that don't share files: **core (MIN-44)** and **web (D-003-3)**. The core
stream is split into a pure normalizer (A) and the subprocess lifecycle + wiring (B), sharing
the frozen `claude/types.ts` contract above.

### Impl-A · Stream normalizer (core, pure) — `claude/streamParser.ts` (NEW)
- Owns `packages/core/src/claude/types.ts` (the frozen union above — write it verbatim) and
  `packages/core/src/claude/streamParser.ts`: a **pure** `parseClaudeStreamLine(line, runId): ClaudeRunEvent[]`
  (one line may yield 0..n normalized events; malformed/non-JSON → a sentinel the caller turns
  into a `parse_warning`). No subprocess, no DB, no execa.
- TDD: unit tests for each real stream-json shape in §3d, malformed JSON → preserved raw,
  multi-content assistant messages, session id from both `system/init` and `result`.
- Deliverable other agents depend on: **post the exact `parseClaudeStreamLine` signature +
  `types.ts` to the channel early** so Impl-B can build against it.

### Impl-B · Subprocess runner + wiring (core) — `claude/runner.ts` (NEW) + routes
- Owns `claude/runner.ts` (`createClaudeCodeSubprocessRunner`, §3c), the `ClaudeRunEvent →
  append+emit` sink (§3b mapping), execa spawn (cwd=projectRoot, stdin prompt, stream-json
  flags), stderr capture, exit/signal → completed/failed, cancel→kill, session capture, debug
  log file. Adds `execa` to `packages/core/package.json`. Consumes Impl-A's `parseClaudeStreamLine`.
- Owns the `POST /api/runs/:id/start` route (§3e) + threading the runner into
  `registerRuntimeHttpRoutes`/`server.ts`.
- TDD with a **fake claude binary** (temp shell script via `OTTER_CLAUDE_BIN`, per
  `runtime.test.ts`): emits stream-json lines + exits 0; session captured; output_delta
  persisted; malformed line → raw preserved + warning; non-zero exit → failed; cancel → kills
  child + records canceled; resume passes `--resume <id>`; cwd == projectRoot.

### Impl-C · tone cleanup (web, D-003-3) — independent
- §3f. Fully independent of A/B (different package). No coordination needed beyond a channel
  start/finish note.

**Coordination:** A↔B share `claude/` (different files) + the frozen type — A posts the
contract first, B acks. C is independent. All three: red→green→refactor, write
`implementations/005-claude-runtime/impl-{a,b,c}-memory.md`, talk over the channel log.

---

## 5. Verification (orchestrator, after implementors)

- `npm test` across packages green; cite which tests exercise the real driver (fake-binary
  integration test = MIN-44 acceptance evidence), the parser units, and the web swap.
- Typecheck/build green. Persist-before-broadcast asserted (event row exists before emit spy fires).
- Confirm cwd==projectRoot, cancel kills child, resume forwards session id, stderr preserved.
- Update `contexts/005-claude-runtime-context.md` (rollup) and remove **D-004-1** + **D-003-3**
  from `contexts/deferred.md` once landed.
- No commit / no push / no Linear "Done" without explicit user approval (project CLAUDE.md).

---

## 6. Out of scope / still deferred

- MIN-21 automatic "start planning run when plannable" (this plan ships the manual trigger only).
- Permission-approval flow beyond recording `run.tool_deferred` (MIN-23 / approvals theme).
- D-002-1 (plan-approval guard), D-003-1 (theme polish), D-003-2 (real nav pages) — untouched.
</content>
</invoke>
