# Plan 005 — Claude Runtime (MIN-44) — Context Rollup

> **Status:** ✅ Complete. Branch `claude-runtime` (off `master`), **no commit yet**
> (awaiting user review, per project CLAUDE.md). Full suite green: **293 tests / 27 files**
> (was 256). Plan: `plans/005-claude-runtime.md`.

---

## 1. What this theme delivered

The **real Claude Code executor** that plan 004 deliberately left as a seam (D-004-1).
Otter can now spawn `claude` headless, stream its output live into the Runs console, and
record everything durably. Also absorbed the small **D-003-3** web cleanup.

**Tickets/items:** MIN-44 (→ In Progress in Linear) + deferred D-004-1 (= MIN-44) + D-003-3.

---

## 2. What got built (by implementor)

### Impl-A · Stream normalizer (core, pure)
- `packages/core/src/claude/types.ts` — **frozen** `ClaudeRunEvent` union + `ClaudeRunner`
  interface (verbatim from the ticket).
- `packages/core/src/claude/streamParser.ts` — pure, deterministic, never throws:
  - `parseClaudeStreamLine(line, runId): ClaudeRunEvent[]` (happy path)
  - `parseClaudeStreamLineDetailed(line, runId): { events; parseWarning? }` ← **the one the
    runner consumes**: malformed/unknown line → `parseWarning` carrying the raw text; blank
    line → `{events:[]}`.
  - Maps real `stream-json` shapes: `system/init`→`session_detected`,
    `assistant` content blocks→`output.delta`(text)/`tool_deferred`(tool_use),
    `result`→`structured_result` (+ session).
- Tests: `packages/core/src/claudeStream.test.ts` (11).

### Impl-B · Subprocess runner + wiring (core)
- `packages/core/src/claude/runner.ts` — `createClaudeCodeSubprocessRunner(deps)`:
  **execa** spawn with `cwd = projectRoot`, context/prompt piped to **stdin then ended**
  (headless `claude -p` blocks on EOF otherwise); stdout read **line-by-line** via
  `node:readline` → `parseClaudeStreamLineDetailed` → §3b mapping with **persist-then-broadcast**
  (`append` returns id+seq → carried in `RunEventPayload` → `emit`); **stderr tee'd** to `log`
  events + `<dataDir>/logs/runs/<runId>.log`; exit 0 → completed, non-zero/signal/spawn-error →
  failed + log; **cancel kills the process group** (`detached:true` + `process.kill(-pid)`,
  direct-kill fallback); `claude.session_detected` persisted as a `note` for future resume.
  The runner **never rejects to the event loop** (a broken Claude can't crash the server).
- `POST /api/runs/:id/start` in `runtime/routes.ts`: 404 missing · 409 terminal/already-running ·
  Claude-readiness recheck for planning/execution (not ready → run marked `failed` + log) ·
  `buildTicketContext(db, run.ticketId, {mode, projectRoot})` (mode from `run.type`; minimal
  context for ticket-less runs) · **fire-and-forget** kickoff · **202** with the run.
- Threading: `RuntimeRoutesPaths{projectRoot, dataDir}` + optional `runner` override through
  `registerRuntimeRoutes`/`registerRuntimeHttpRoutes`/`server.ts` (`paths.root`/`paths.dataDir`).
  Runner constructed **once** per app; tests inject a fake via `runnerOverride`.
- Added `execa@9.6.1` to `@otter/core`.
- Tests: `claudeRunner.test.ts` (9, fake-binary MIN-44 acceptance) + `runStart.test.ts` (7).

### Impl-C · `@vanilla-extract/dynamic` cleanup (web, D-003-3)
- Installed `@vanilla-extract/dynamic@2.1.5` (independently versioned — **no 4.x exists**;
  pairs with `@vanilla-extract/css@1.20.1`). `ui/tone.ts`'s `inlineVars()` now delegates to
  `assignInlineVars`; `unwrapVar` shim deleted; `Card`/`Pill`/`Badge` call sites untouched.
  Pure refactor, no behavior/visual change. Web suite 131 green, build OK.

---

## 3. MIN-44 invariants — how they're satisfied (evidence)

| Invariant | Where / test |
|---|---|
| SQLite is source of truth; persist before broadcast | runner.ts: `const row = append(...)` then `emit(...,{id:row.id,seq:row.seq})`; test "persists each event BEFORE it broadcasts (emit sees the row already in the repo)" |
| Failed Claude must not crash server | runner wraps all spawn/stream/exit handling; `reject:false`; non-zero exit → `failed` run, never throws |
| Cancellation explicit + recorded | `cancelRun` process-group kill → `status_changed → canceled`; test "cancelRun kills the child and records canceled" |
| Never runs outside project root | `cwd: projectRoot` (runner.ts:217); test asserts `cwd == projectRoot` |
| Don't swallow stderr | stderr tee'd to `log` events + `<dataDir>/logs/runs/<runId>.log` |
| Malformed JSON → raw preserved | `parseWarning` → `note{kind:"parse_warning", raw}`; test "preserves a malformed line as a parse_warning note" |
| Testable with fake binary | both core tests use `OTTER_CLAUDE_BIN` → temp shell script (mirrors `runtime.test.ts`) |
| Resume forwards session id | `resumeRun` adds `--resume <id>`; test asserts argv |

---

## 4. Where things live (additions to the §4 map in 001-context-summary)

| Concept | Location |
|---|---|
| Normalized driver event union + `ClaudeRunner` iface | `packages/core/src/claude/types.ts` |
| stream-json → ClaudeRunEvent parser (pure) | `packages/core/src/claude/streamParser.ts` |
| Subprocess runner (execa) | `packages/core/src/claude/runner.ts` |
| Start endpoint `POST /api/runs/:id/start` | `packages/core/src/runtime/routes.ts` |
| Runner/project-root threading | `runtime/index.ts`, `server.ts` |
| Driver tests | `packages/core/src/{claudeStream,claudeRunner,runStart}.test.ts` |
| tone dynamic vars (post-cleanup) | `packages/web/src/ui/tone.ts` (`assignInlineVars`) |

---

## 5. Still open / next

- **MIN-21** — auto-start a planning run when a ticket becomes plannable. This plan ships
  only the **manual** `POST /runs/:id/start` trigger; MIN-21 wires the automatic one onto it.
- **resume retrieval** — the session id is persisted as a `note`; reading it back to drive
  `resumeRun` (comment-forwarding / approval continuation) lands with MIN-23 (approvals).
- **D-002-1** (plan-approval guard), **D-003-1** (theme polish), **D-003-2** (real nav pages)
  remain deferred — untouched by this theme.
- Pre-existing unrelated `act(...)` warning in `RunsConsole.test.tsx` (not introduced here).

---

## 6. Process notes (actor pattern)

- Channel: `channels/005-claude-runtime-channel.log` — Impl-A posted the frozen
  parser/types contract, Impl-B ACK'd and consumed `parseClaudeStreamLineDetailed` (evidence:
  runner.ts imports + the §3b mapping). Impl-C independent.
- Per-agent memory: `implementations/005-claude-runtime/impl-{a,b,c}-memory.md`.
- **No commit / no push / no Linear "Done"** without explicit user approval (project CLAUDE.md).
  MIN-44 currently sits **In Progress** in Linear.
</content>
