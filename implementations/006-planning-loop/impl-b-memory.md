# Impl-B memory — MIN-21 + MIN-22 (planning orchestrator + result parser)

Branch `006-planning-loop`. Actor pattern: red→green→refactor, least code, suite green.

## Files read / written

| File | R/W | Why |
|---|---|---|
| plans/006-planning-loop.md | R | scope §3, §2.4, §2.5, §2.8, §1 |
| channels/006-planning-loop-channel.log | R/W | Impl-A "repos ready" symbols; posted asks + ready |
| packages/core/src/claude/runner.ts | R | mapping table, persist-before-broadcast, status payloads |
| packages/core/src/runtime/routes.ts | R | §3e missing-Claude guard to mirror; runnerOverride seam |
| packages/core/src/runtime/index.ts | R | registerRuntimeRoutes(...runner) signature |
| packages/core/src/events/bus.ts | R | EventBus.subscribe / Emit / EventEnvelope |
| packages/core/src/context/packet.ts | R/W | appended planning Output-contract block (planning mode only) |
| packages/core/src/claude/detect.ts | R | getCachedClaudeStatus default for isClaudeReady |
| packages/core/src/claude/types.ts | R | ClaudeRunner interface |
| packages/persistence/src/repositories/{runs,runEvents,transitions,runs,plans,attention,tickets}.ts | R | repo APIs |
| packages/shared/src/{events,runs,domain,plans,attention}.ts | R | CHANNELS, types, statuses |
| packages/core/src/runtime.test.ts | R | fake-binary + real-SQLite test pattern |
| **packages/core/src/claude/planResult.ts** | W | pure parser (deliverable 1) |
| **packages/core/src/claude/planResult.test.ts** | W | 11 tests |
| **packages/core/src/runtime/orchestrator.ts** | W | orchestrator (deliverable 2) |
| **packages/core/src/orchestrator.test.ts** | W | 5 tests (real SQLite + bus, fake runner/writer) |
| **packages/core/src/context/packet.ts** | W | Output-contract block (deliverable 3) + 1 test in context.test.ts |
| **packages/core/src/server.ts** | W | runner-once wiring + orchestrator.start() + registerDocsRoutes (deliverable 4) |
| packages/core/src/context.test.ts | W | +1 test (planning has contract, execution doesn't) |

## Summary

- `parsePlanResult` (never throws): last marker region wins; split header/body on first `---`;
  PLAN_READY→ready (title fallback first `#` heading→''); PLAN_BLOCKED→blocked; missing/bad/empty→error
  with raw tail ≤4000. Tolerates stray backticks/whitespace around header JSON.
- `createPlanningOrchestrator(deps)` fully DI'd. `start()` subscribes to CHANNELS.project.
  - `ticket_transitioned`→`plannable`: dedup (no non-terminal planning run) → create run →
    Claude-readiness guard (not ready ⇒ failed run + log, mirrors routes.ts §3e) → emit run_created →
    buildTicketContext(planning) → fire-and-forget runner.startPlanningRun.
  - `run_status_changed`: runId = payload.runId ?? payload.id; read authoritative runs.get(runId);
    planning+completed ⇒ concat structured_result note value + output_delta text → parsePlanResult →
    ready: plans.createProposed + writeArtifact(<ticket>-v<version>.md) + setArtifactPath + attention.open +
    emit attention_item_created + applyTransition(plannable→needs_user_approval) (guarded) + emit ticket_transitioned;
    blocked: note{plan_blocked}; error: note{plan_parse_error,raw}. Persist before every broadcast.
- packet.ts planning mode appends the `<<<OTTER_PLAN>>>` Output-contract block (deterministic, no clock/random).
  Execution mode unchanged.
- server.ts: subprocess runner built ONCE, shared as runnerOverride (routes) + runner (orchestrator);
  orchestrator.start(); registerDocsRoutes(app, db, {dataDir}).

## Orchestrator deps interface (for verification)

```ts
createPlanningOrchestrator({
  db, bus, emit, runner, projectRoot, dataDir, writeArtifact, isClaudeReady?
}) => { start(): () => void }
// WriteArtifact typed structurally (local type) — orchestrator never imports C's writer.
// isClaudeReady defaults to getCachedClaudeStatus.
```

## Gotchas

- `run_status_changed` has TWO payload shapes (route `{id:runId,...}` vs runner `{id:eventId,runId,seq}`).
  Resolve `payload.runId ?? payload.id` then READ THE DB for authoritative status/type/ticket. Do not "fix" the payloads.
- noUncheckedIndexedAccess: use `arr[0]?.x` / `mock.calls[0]?.[0]` in tests.
- writeArtifact failure is NON-fatal: plan still lives in SQLite; we log why the file is missing.
- attention.open is idempotent per (ticket,kind) — safe under duplicate run_status_changed.
- Re-entrancy guard = "ticket still plannable" + planning-run dedup; duplicate completed events are harmless.

## Test delta

Baseline ~317 (2 cross-file flakes). Added: planResult 11 + orchestrator 5 + context 1 = +17 of mine in core
(plus Impl-A/C tests already present). Full suite with `--no-file-parallelism`: 336 passed / 10 skipped,
ONLY `planApproval.test.ts` (Impl-C) failing.

## KNOWN FAILURE — NOT MINE

- `src/planApproval.test.ts` (Impl-C): "Method 'GET' already declared for route '/api/docs/artifacts'" —
  registerDocsRoutes registered twice in that test's setup. Flagged to Impl-C on channel. My server.ts
  registers docs exactly once.
- `src/claude.test.ts`: a parallel-exec flake (fake-bin race); passes in isolation / with `--no-file-parallelism`.
