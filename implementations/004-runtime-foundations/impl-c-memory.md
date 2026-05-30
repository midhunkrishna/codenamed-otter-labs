# Impl-C memory — MIN-19 (runs API) + MIN-18 (Claude readiness/guard) + MIN-45 (project bootstrap/expose)

## Tickets
- MIN-19: runs + run-events HTTP API (list/create/get/events/cancel).
- MIN-18: Claude readiness probe + run-creation guard + `/api/claude/status`.
- MIN-45: idempotent default-project bootstrap + `/api/project`.

## Files read
- plans/004-runtime-foundations.md (§3f/3h/3j, Wave-2 Impl-C, §5 C tests)
- packages/core/src/runtime/index.ts (stub I replaced), server.ts, events/bus.ts,
  routes/tickets.ts, routes/index.ts, routes.test.ts (bootstrap pattern)
- @otter/shared: runs.ts, events.ts, constants.ts (API_PREFIX), index.ts
- @otter/persistence: repositories/runs.ts, projects.ts, runEvents.ts, index.ts
- migrations 0002/0003 (confirmed `ticket` table + `project_id` DEFAULT 'local-project')

## Files written
- packages/core/src/claude/detect.ts — detectClaude(opts) + cached boot probe
  (getCachedClaudeStatus/refreshClaudeStatus/resetClaudeStatusCache). Resolves
  binPath ?? OTTER_CLAUDE_BIN ?? "claude"; execFile `<bin> --version`, ~3000ms
  timeout; NEVER throws; parses version (semver token / first line); distinguishes
  ENOENT / timeout / non-zero with actionable errors.
- packages/core/src/project/bootstrap.ts — bootstrapDefaultProject (upsertDefault,
  idempotent), getCurrentProjectId(), getDefaultProject(db).
- packages/core/src/runtime/routes.ts — registerRuntimeHttpRoutes: all runs/claude/
  project routes; builds repos from db; persist-before-broadcast emits.
- packages/core/src/runtime/index.ts — barrel keeping FROZEN signatures
  (registerRuntimeRoutes/detectClaude/bootstrapDefaultProject + ClaudeStatus,
  getCurrentProjectId) re-exported from the sibling modules.
- packages/core/src/runtime.test.ts (14 tests), packages/core/src/claude.test.ts (4 tests).

## Did NOT touch
server.ts, events/*, routes/* (Impl-B/shared), persistence, shared.

## Guard behaviour (MIN-18)
POST /api/runs always CREATES the run first. For planning/execution when Claude
not ready: setStatus(id,'failed') + runEvents.append(id,'log',{message}) (message
includes claude.error + how to fix), emit run_created + run_status_changed, return
201 with the failed run. manual/review (or ready) → queued.

## Verify
- npx tsc -p packages/core/tsconfig.json --noEmit → exit 0.
- npx vitest run packages/core packages/persistence → 115 passed (was 97 prior;
  +14 runtime +4 claude). No regressions.

## Notes for Impl-E (Wave 3)
- Routes + shapes posted to channel (READY msg). Errors keep `{error}`.
- Run list is newest-first; status filter validated (400 on bad status).
- Guard-failed planning/execution runs come back as a real run row with status
  `failed` and a `log` run-event — render it like any failed run (the log message
  is the actionable reason).
- WS: subscribe `project` for run_created/run_status_changed, `run:<id>` for the
  same + run_output_delta (Impl-B's client).
