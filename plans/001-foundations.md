# Plan 001 — Foundations (MIN-11, MIN-12, MIN-13)

> Pattern: `actor.agent` (Orchestrator + Implementors). PROJECT-DIR = `/workspace/otter`.
> Branch: `foundations`. Stack: **npm workspaces monorepo · Fastify · Vite+React+TS · Vitest · better-sqlite3**.

## 1. Goal
Stand up the local-first Otter Labs application foundation:
- **MIN-11** local Node/TS app shell (CLI → backend, port 4873, health endpoint, `.otter-labs` data dir, idempotent startup).
- **MIN-12** `.otter-labs` data-dir layout + SQLite (`otter.db`) + idempotent migration runner.
- **MIN-13** React web shell (nav: Board/Runs/Approvals/Docs/Settings, API client under `/api`, WS client stub under `/ws`).

## 2. Repository layout (the contract)
```
/workspace/otter
├── package.json                 # root: workspaces ["packages/*"], dev scripts, vitest
├── tsconfig.base.json           # shared compiler options
├── .gitignore                   # node_modules, dist, .otter-labs
├── vitest.workspace.ts
└── packages/
    ├── shared/       (contract) @otter/shared — paths, config, constants, types (orchestrator-owned, node-only)
    ├── core/         (MIN-11)   @otter/core  — server, CLI, health (depends on shared + persistence)
    ├── persistence/  (MIN-12)   @otter/persistence — db, migrator, migrations (depends on shared)
    └── web/          (MIN-13)   @otter/web   — Vite + React shell (standalone; mirrors HTTP contract)
```

> `@otter/shared` exists to break the core↔persistence cycle and keep node-only `fs`/`path` code out of the browser bundle. `web` does NOT import shared; it owns local mirror constants for `/api` + `/ws`.

### Frozen contracts (orchestrator owns; implementors build against these)
- **`@otter/shared/src/paths.ts`** — canonical data-dir layout. Single source of truth for both `core` and `persistence`:
  - `resolveDataDir(root, override?)` → absolute `.otter-labs` path (relative & absolute inputs both work).
  - `OtterPaths` = `{ root, dataDir, dbFile, logs, artifacts, plans, executionReports, diffs, sessionMeta }`.
- **`@otter/core/src/config.ts`** — `loadConfig(env)` → `{ port: number (default 4873), dataDir, projectRoot }`.
- **HTTP contract** (so `web` parallelizes against it without needing `core` source):
  - `GET /api/health` → `200 {"status":"ok","uptimeMs":number,"dataDir":string}`
  - All REST under `/api`, all sockets under `/ws` (stub: accept + echo `{type:"hello"}`).
  - Web dev server (Vite) proxies `/api` and `/ws` → `http://localhost:4873`.
- **Persistence init signature** (negotiated A↔B over channel): `initPersistence(paths): { db, applied: string[] }` called from `core` CLI startup. `ensureLayout(paths)` mkdir -p's the full tree; never deletes existing `otter.db`.

## 3. Actor split (3 Implementors, parallel)
| Implementor | Ticket | Owns | Consumes |
|---|---|---|---|
| **A · core** | MIN-11 | root workspace files, `packages/core/**`, `paths.ts`+`config.ts` (the contract), Fastify server, `/api/health`, `/ws` mount, CLI entry, startup logging, idempotent dir bootstrap | B's `initPersistence` signature (via channel) |
| **B · persistence** | MIN-12 | `packages/persistence/**`, `ensureLayout`, `openDatabase`, `migrator` + `migrations` table, `0001_init.sql`, error handling | core `paths.ts`/`config.ts` contract |
| **C · web** | MIN-13 | `packages/web/**`, Vite config + proxy, React shell, nav, `api/client.ts`, `ws/client.ts` stub | frozen HTTP contract only |

**Why this parallelizes:** the orchestrator freezes `paths.ts`/`config.ts` and the HTTP contract up front, so B (needs paths) and C (needs HTTP shape) do not block on A's implementation. The two real handshakes — A↔B (persistence init wiring into CLI) and A↔C (health payload shape) — are resolved over the channel log.

## 4. Per-ticket acceptance → test mapping
**MIN-11 (core)** — Vitest:
- `.otter-labs` created when missing; reused when present (idempotent).
- configured port respected (`OTTER_PORT` / config).
- `GET /api/health` responds 200.
- repeated startup is safe.

**MIN-12 (persistence)** — Vitest:
- startup creates full dir tree (logs, artifacts, plans, execution-reports, diffs, session-meta).
- migrator applies migrations once; skips already-applied.
- never deletes existing `otter.db`.
- corrupt migration state → clear error that fails startup.
- relative AND absolute data-dir paths resolve correctly.

**MIN-13 (web)** — Vitest + React Testing Library:
- app shell renders.
- nav links render (Board/Runs/Approvals/Docs/Settings).
- health API callable from UI (api client hits `/api/health`, mocked in test).

## 5. Invariants (all tickets)
- Local-first; no remote service required for startup.
- Startup idempotent; existing `.otter-labs` and `otter.db` reused, never deleted.
- All paths resolve under the configured data dir.
- Failed migration fails startup with a clear error.
- API stays under `/api`; WebSocket stays under `/ws`.

## 6. Actor-pattern artifacts
- Plan: `plans/001-foundations.md` (this file).
- Context (orchestrator rollup): `contexts/foundations-context.md`.
- Channel (inter-agent log): `channels/foundations-channel.log` — format `from: / to: / message:`.
- Implementor memory: `implementations/foundations/<implementor>-memory.md` (files r/w table, summary, gist).

## 7. Execution sequence
1. Orchestrator scaffolds workspace skeleton + frozen contracts + each `package.json` (no impl).
2. `npm install` at root (**requires user approval** — network + writes node_modules/lockfile).
3. Spawn Implementors A, B, C in parallel (Agent Teams), each red-green-refactor, writing memory + channel messages.
4. Orchestrator verifies: reads impl files, confirms channel messages were acked by evidence (code), runs `npm test`, ties up loose ends, updates context file.
5. Report; (commit only if user asks).

## 8. Open questions — RESOLVED
- Repo layout → npm workspaces monorepo.
- Backend framework → Fastify.
- Frontend tooling → Vite + React + TS.
- Test runner → Vitest.
- SQLite driver → better-sqlite3 (ticket-permitted default).
- PROJECT-DIR → `/workspace/otter` (access restricted to PWD per user).

## 9. Destructive-action gate
No destructive ops planned (greenfield, empty repo). `npm install` and agent file-writes are additive. Will request approval before install + spawning the team. Will NOT commit/push unless asked.
