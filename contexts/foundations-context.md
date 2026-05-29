# Foundations — Orchestrator Context

Rollup of sub-agent progress for plan `001-foundations.md`. Updated by the Orchestrator.

## Status — COMPLETE ✅
- [x] Phase 1: workspace skeleton + frozen contracts scaffolded (orchestrator)
- [x] Phase 2: `npm install` (298 pkgs; better-sqlite3 native build OK)
- [x] Phase 3: Implementor A (core / MIN-11)
- [x] Phase 3: Implementor B (persistence / MIN-12)
- [x] Phase 3: Implementor C (web / MIN-13)
- [x] Phase 4: verification — **28/28 tests**, 4 packages typecheck clean, real boot + health verified

## Implementor summaries
**A · core / MIN-11** — `packages/core/src/{server,cli,index}.ts` + 2 tests. Fastify `createServer`, `startApp` (DI seam `init`), `main` CLI. `GET /api/health` → `{status,uptimeMs,dataDir}`. `/ws` stub. Idempotent startup. 3 tests pass.

**B · persistence / MIN-12** — `packages/persistence/src/{layout,database,migrations,index}.ts` + `migrations/0001_init.sql` + 9 tests. `ensureLayout`, `openDatabase` (WAL, FK on), `runMigrations` (tx per file, `migrations` table, skip-applied, clear error on fail), `initPersistence`. Tables: ticket, comment, plan, run, permission, audit. 9 tests pass.

**C · web / MIN-13** — `packages/web/{index.html,src/*}` + 3 tests. React shell, `NAV_ITEMS` (Board/Runs/Approvals/Docs/Settings), `api/client.ts` (`getHealth`), `ws/client.ts` stub, `HealthBadge`. Vite dev on :5873 proxying `/api`+`/ws`→:4873. 3 tests pass.

## Channel verification (acks confirmed by evidence)
- A↔B init seam: B ACKed + CONFIRMED `initPersistence(paths)->{db,applied}`; core integration test runs the REAL impl green. Evidence: `core/src/integration.test.ts` + live boot created `.otter-labs/otter.db` w/ `0001_init.sql` recorded.
- A↔C health shape: core CONFIRMED `GET /api/health`→`{status,uptimeMs,dataDir}`, prefixes `/api`+`/ws` unchanged. Evidence: `web/src/components/HealthBadge.test.tsx` + matching server impl.

## CLI data-dir anchoring — final behavior (per user)
- Requirement: `npx otter-labs` must create `.otter-labs` **in the directory the command was run from** (invocation cwd), not the monorepo root.
- An earlier interim fix anchored to the repo root via `findProjectRoot()` — **reverted/removed** (obsolete under the new requirement). `loadConfig` default root is back to `process.cwd()`.
- `cli.ts` now resolves the root via `invocationRoot(env, cwd) = env.INIT_CWD ?? cwd`. `npx`/`npm` set `INIT_CWD` to the user's invocation dir even when the script runs with a different cwd (e.g. `npm -w` runs inside the package). For a directly-run binary, falls back to `process.cwd()`. Either way → the dir the user ran `otter-labs` from. Unit-tested (`core/src/cli.test.ts`).
- **CLI packaging (lightweight, not yet published):** bin renamed `otter` → **`otter-labs`** (`node_modules/.bin/otter-labs` → `@otter/core/src/cli.ts`). Shebang `#!/usr/bin/env -S node --import tsx`; `tsx` moved to `@otter/core` runtime `dependencies`. Runs from `src` via tsx, so the `.sql`-in-dist follow-up does not apply to this path. Not booted (user does not want to run it yet); wiring verified statically.
- A full compiled/publishable package (build all to dist JS, bundle `.sql`, drop tsx) remains an available follow-up if/when distribution beyond the repo is needed.

## Real end-to-end verification
`npm start` → backend on :4873, `GET /api/health` → `{"status":"ok",...,"dataDir":"/workspace/otter/.otter-labs"}`; full layout (logs, artifacts/{plans,execution-reports,diffs}, session-meta) + `otter.db` (tables: ticket, comment, plan, run, permission, audit, migrations) created; second boot idempotent. Port released cleanly after.

## Loose ends / follow-ups (non-blocking)
- **`.sql` not copied to `dist/`** (B): runtime is fine today (package `main` = `src` under tsx/vitest). If a compiled `dist` is ever shipped, add a copy step or inline the SQL (migrations dir resolves via `import.meta.url`).
- **persistence `db` handle not closed on shutdown** (A): `startApp.close()` closes Fastify only. Fine for current CLI lifecycle; revisit for long-lived restart-in-process scenarios.
- Tickets MIN-11/12/13 left in Linear "In Progress" — not modified (no instruction to transition).
