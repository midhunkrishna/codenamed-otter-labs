# Impl-B memory — MIN-44 Claude subprocess runner + start route

Theme `claude-runtime` (plan 005). Scope: core package subprocess runner, the
`ClaudeRunEvent → append+emit` sink (§3b), execa spawn, `POST /api/runs/:id/start`
wiring, the fake-binary test. Stayed in lane (no web; did not touch
types.ts/streamParser.ts owned by Impl-A).

## 1. Files read & written

| File | R/W | Why |
|---|---|---|
| plans/005-claude-runtime.md | R | the contract (§2 invariants, §3b/§3c/§3d/§3e, §4 Impl-B) |
| packages/shared/src/runs.ts | R | RUN_EVENT_KINDS, AgentRun/Event, RunStatus, isTerminalRunStatus |
| packages/shared/src/events.ts | R | RunEventPayload {id,runId,seq,text?}, CHANNELS, EVENT_TYPES |
| packages/shared/src/types.ts | R | OtterPaths.root / .dataDir (threading projectRoot/logsDir) |
| packages/core/src/events/bus.ts | R | Emit type |
| packages/core/src/claude/detect.ts | R | resolveClaudeBin, getCachedClaudeStatus |
| packages/core/src/claude/types.ts | R | ClaudeRunEvent union + ClaudeRunner iface (Impl-A, frozen) |
| packages/core/src/claude/streamParser.ts | R | parseClaudeStreamLineDetailed (consumed it) |
| packages/core/src/context/packet.ts | R | buildTicketContext(db, ticketId, {mode, projectRoot}) |
| packages/persistence/src/repositories/runEvents.ts | R | append returns the persisted row (id+seq) — enables persist-before-broadcast |
| packages/persistence/src/repositories/runs.ts | R | setStatus/cancel/get semantics |
| packages/core/src/runtime.test.ts | R | fake-binary + temp-SQLite + OTTER_CLAUDE_BIN pattern (reused) |
| packages/core/src/runtime/routes.ts | R | create-guard shape, emitRun helper |
| packages/core/src/runtime/index.ts | R/W | thread paths + runner into registerRuntimeRoutes |
| packages/core/src/server.ts | R/W | pass {projectRoot: paths.root, dataDir: paths.dataDir} |
| packages/core/package.json | W | add execa ^9.5.1 (resolved 9.6.1) |
| **packages/core/src/claude/runner.ts** | W (NEW) | the runner factory + §3b sink |
| **packages/core/src/claudeRunner.test.ts** | W (NEW) | fake-binary integration test (9 tests) |
| **packages/core/src/runStart.test.ts** | W (NEW) | start-route contract test, fake runner (7 tests) |
| channels/005-claude-runtime-channel.log | R/W | acked Impl-A's parser contract |

## 2. What I implemented

- **`createClaudeCodeSubprocessRunner(deps: RunnerDeps): ClaudeRunner`**
  - Spawns `claude -p --output-format stream-json --verbose` (resume adds
    `--resume <id>`) via execa, `cwd = projectRoot`, stdin piped then `.end()`ed.
  - Streams stdout line-by-line via `node:readline` (handles partial chunks),
    feeds each line to `parseClaudeStreamLineDetailed`, maps events through the
    §3b table: append(kind,payload) → read back id/seq → emit(channel,type,
    RunEventPayload). PERSIST BEFORE BROADCAST.
  - run.started → setStatus(running)+status_changed; output.delta → output_delta;
    session_detected → note{kind:"claude_session"} (no broadcast); structured_result
    → note{kind:"structured_result"}; tool_deferred → permission_requested (run+
    approvals channels); completed/failed derived from EXIT (not the stream).
  - stderr tee'd to `log {stream:"stderr"}` events + `<logsDir>/<runId>.log` debug
    file (raw stdout also written there). Never swallowed.
  - Exit 0 (and not failed/signal) → completed; non-zero/signal/spawn-error →
    failed + a `log {message}` with code/signal + stderr tail.
  - NEVER rejects: drive() wraps everything in try/catch/finally; a broken Claude
    (ENOENT, stream error) becomes a `failed` run.
  - cancelRun: killTree(SIGTERM → SIGKILL fallback) on the process GROUP, records
    status_changed→canceled (persist+emit). Active children tracked in Map<runId,child>.
- **`POST /api/runs/:id/start`** (routes.ts): 404 missing; 409 terminal/running;
  Claude-readiness recheck for planning/execution (→ failed+log+409); buildTicketContext
  (mode from run.type; minimal context for ticket-less runs); fire-and-forget
  startExecutionRun/startPlanningRun; 202 with the run. Runner constructed ONCE in
  registerRuntimeHttpRoutes (test-injectable via `runnerOverride`).
- Threaded `RuntimeRoutesPaths {projectRoot, dataDir}` + optional runner through
  registerRuntimeRoutes / registerRuntimeHttpRoutes / server.ts. logsDir =
  join(dataDir,"logs","runs"), mkdir -p on register.

## 3. Gist / learnings

- **execa under tsx**: `tsx -e "<eval>"` mode chokes on execa's `unicorn-magic`
  (pure-ESM subpath exports) with ERR_PACKAGE_PATH_NOT_EXPORTED. This is a tsx
  CJS-resolver quirk of EVAL mode only — `tsx <file>` (the prod `start` path) and
  vitest (Vite/esbuild resolver) both import execa fine. Verified both.
- **stdin.end() is mandatory**: headless `claude -p` blocks on EOF. Write the
  context/prompt to child.stdin then `.end()`. Fakes use `cat > /dev/null` to drain.
- **Persist-before-broadcast**: persistence `append()` RETURNS the inserted row
  (id+seq) — read that back into the RunEventPayload. The test proves it: the emit
  spy snapshots `runEvents.list(runId)` at broadcast time and asserts the row
  referenced by `payload.id` is ALREADY present.
- **cancel of a shell that spawned a grandchild**: `child.kill()` only signals the
  shell; a `sleep`/tool grandchild keeps stdout's write-end open → the `for await`
  readline loop never sees EOF → drive() hangs ~10s. Fix: spawn `detached: true`
  (own process group, gid == leader pid) and cancel via `process.kill(-pid, sig)`
  to signal the WHOLE group; fall back to child.kill if the group signal throws.
- **cwd test technique**: fake script emits a `result` line whose `result` is
  `$(pwd)` → lands in a structured_result note → assert it contains the project
  root dir name. Also assert the `<logsDir>/<runId>.log` debug file is non-empty.
- **resume argv test**: fake does `echo "$@" > argv.txt`; assert it contains
  `--resume` + the session id (+ the base stream-json flags).
- **missing-binary detection**: with `reject:false`, execa resolves with
  `failed:true`, `exitCode:undefined`, `code:"ENOENT"`. Do NOT `exitCode ?? 0`
  (that masks ENOENT as success) — trust the `failed` flag; report `code` as the
  spawn-error reason.
- **cancel test timing**: poll for a real OUTPUT event (the session note), not just
  `status==="running"` — `run.started`/running is recorded synchronously before the
  child's process group is up, so cancelling on status alone can SIGTERM before the
  group exists. Waiting on emitted output guarantees the tree is live.

## 4. Test results

- `npx vitest run packages/core/src/claudeRunner.test.ts` → **9 passed**
- `npx vitest run packages/core/src/runStart.test.ts` → **7 passed**
- `npx vitest run packages/core` → **105 passed (12 files)**, no regressions
- `tsc -p packages/core/tsconfig.json --noEmit` clean; `npm run build -w @otter/core` clean.
