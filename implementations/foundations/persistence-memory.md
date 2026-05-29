# Implementor B "persistence" — MIN-12 memory

## Files read & written

| File | R/W | Notes |
|------|-----|-------|
| packages/shared/src/paths.ts | R | `resolvePaths`, `resolveDataDir`, `layoutDirectories` (frozen contract) |
| packages/shared/src/constants.ts | R | `DATA_DIR_NAME=.otter-labs`, `DB_FILE_NAME=otter.db` |
| packages/shared/src/types.ts | R | `OtterPaths` shape |
| packages/shared/src/index.ts | R | barrel exports |
| channels/foundations-channel.log | R/W (append) | orchestrator kickoff; posted ACK to core |
| packages/persistence/package.json | R | deps: better-sqlite3, @otter/shared; main=src/index.ts |
| packages/persistence/tsconfig.json | R | extends base, rootDir src |
| vitest.workspace.ts / tsconfig.base.json / package.json | R | ESM, Bundler resolution, vitest workspace |
| packages/persistence/src/migrations/0001_init.sql | W | initial schema |
| packages/persistence/src/layout.ts | W | `ensureLayout` |
| packages/persistence/src/database.ts | W | `openDatabase` |
| packages/persistence/src/migrations.ts | W | `runMigrations`, `MIGRATIONS_DIR` |
| packages/persistence/src/index.ts | W | barrel + `initPersistence` |
| packages/persistence/src/persistence.test.ts | W | 9 vitest cases |

## Summary
Implemented the local persistence foundation for MIN-12. Public API exposed from
`@otter/persistence`: `ensureLayout(paths)`, `openDatabase(paths)`,
`runMigrations(db, migrationsDir?)`, and the startup convenience
`initPersistence(paths) -> { db, applied }` (the seam `@otter/core` calls).

- Layout creation uses `mkdirSync(recursive)` over `layoutDirectories(paths)` from
  @otter/shared — idempotent, never deletes.
- DB opened via better-sqlite3 with WAL + foreign_keys pragmas; default open mode
  creates-or-opens, never truncates an existing `otter.db`.
- Migration runner: creates a `migrations` bookkeeping table (owned by runner, not
  a migration file), discovers `*.sql` in lexical order via `node:fs`, resolves the
  dir relative to the module via `import.meta.url`, applies each pending file in its
  own transaction, records it, skips applied ones. On failure the txn rolls back and
  a clear Error is thrown so startup fails.
- `0001_init.sql` creates ticket, comment(ticket_id FK), plan(ticket_id FK),
  run(ticket_id/plan_id FK), permission(run_id FK), audit. TEXT PKs, ISO-8601
  timestamp defaults, CREATE TABLE IF NOT EXISTS for extra safety.

## Gist
Source-of-truth = SQLite. Artifacts dirs are derived companions. Invariants held:
never delete otter.db, never rerun an applied migration, failed migration fails
startup, all paths resolve under configured data dir. Tests: 9 passing covering
layout tree, apply-once/skip, data survival, corrupt-migration error + rollback,
relative & absolute data-dir forms.

## Open seam concern
`tsc` build does NOT copy `.sql` into `dist/`; runtime currently consumes `src/`
(package main = ./src/index.ts, run under tsx/vitest) so this is fine today. If a
compiled `dist` is ever shipped, add a copy step or inline the SQL. Flagged to core.
