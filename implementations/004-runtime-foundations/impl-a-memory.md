# Impl-A memory — Runs + project persistence (MIN-19 data, MIN-45 persistence)

## 1. Files read / written

| File | R/W | Note |
|---|---|---|
| plans/004-runtime-foundations.md | R | Spec; my work = §3a/3b/3c, Wave 1, §5 tests "A" |
| packages/shared/src/runs.ts | R | FROZEN contract — Project, AgentRun, AgentRunEvent, RunType, RunStatus, RunListFilter, guards, DEFAULT_PROJECT_ID |
| packages/shared/src/events.ts | R | FROZEN (Impl-B's; just confirmed not mine to touch) |
| packages/persistence/src/repositories/tickets.ts | R | row→camel mapper + prepared-stmt pattern |
| packages/persistence/src/repositories/comments.ts | R | JSON metadata column pattern (validate plain object, JSON.stringify guard) |
| packages/persistence/src/migrations/0001_init.sql | R | legacy singular `run` table (left untouched) |
| packages/persistence/src/migrations/0002_ticket_core.sql | R | additive ALTER pattern |
| packages/persistence/src/migrations.ts | R | lexical-order runner, per-file txn, idempotent |
| packages/persistence/src/index.ts | R/W | added 3 factory exports |
| packages/persistence/src/repositories.test.ts | R | temp-SQLite test harness pattern |
| packages/persistence/src/migrations/0003_runtime.sql | W | NEW migration |
| packages/persistence/src/repositories/projects.ts | W | NEW |
| packages/persistence/src/repositories/runs.ts | W | NEW |
| packages/persistence/src/repositories/runEvents.ts | W | NEW |
| packages/persistence/src/runtime.test.ts | W | NEW (17 tests) |

## 2. What I implemented

- **Migration 0003_runtime.sql** (additive only; 0001/0002 untouched, legacy `run` left intact):
  - `project` table + `INSERT OR IGNORE` seed of `local-project` (= DEFAULT_PROJECT_ID), name 'Local Project'. No single-row constraint.
  - `ALTER TABLE ticket ADD COLUMN project_id TEXT NOT NULL DEFAULT 'local-project'` — backfills existing + new rows, so ticket repo needs NO change.
  - `agent_runs` (project_id FK NOT NULL DEFAULT local-project, ticket_id FK NULL ON DELETE SET NULL, type, status, title, timestamps + started_at/finished_at). Index (project_id, status).
  - `agent_run_events` (run_id FK NOT NULL ON DELETE CASCADE, seq INTEGER, kind, payload TEXT JSON default '{}', created_at). UNIQUE(run_id, seq). Index on run_id.
- **createProjectRepository(db)**: getDefault() (throws if seed missing), get(id), upsertDefault (INSERT … ON CONFLICT(id) DO UPDATE — always reuses local-project id, refreshes name/root/data_dir/updated_at).
- **createAgentRunRepository(db)**: create (validates type via isRunType, defaults projectId to getDefault().id, ticketId→null, status queued), get, list (newest-first DESC, optional project/ticket/status filters), setStatus (validates via isRunStatus, bumps updated_at, sets started_at on first running, finished_at on terminal — both via SQL CASE so existing values preserved), cancel (throws if missing or isTerminalRunStatus, else setStatus canceled).
- **createAgentRunEventRepository(db)**: append (validates kind via RUN_EVENT_KINDS, plain-object payload, JSON.stringify; next seq = MAX(seq)+1 starting at 1, read+insert wrapped in a db.transaction so seq can't collide on one connection), list (seq ASC).
- All three exported from index.ts.

## 3. What I learned / gotchas

- `@otter/shared` exports `isRunEventKind` is NOT provided — only RUN_EVENT_KINDS const. I implemented a local `isRunEventKind` guard in runEvents.ts (mirrors the isRunType style). Same for payload plain-object check (copied comments.ts pattern).
- Lifecycle timestamps are set with SQL `CASE WHEN ? THEN strftime(...) ELSE col END` so started_at is only stamped on the FIRST entry to running and never clobbered on later transitions.
- The migration runner records applied migrations in a `migrations` table, so reopening the same DB file does NOT re-run 0003 — durability test relies on this.
- `INSERT OR IGNORE` for the seed + `ON CONFLICT DO UPDATE` for upsert keep MIN-45 "second startup reuses same id" true.
- tsc clean; vitest 46 passed (29 prior + 17 new).
