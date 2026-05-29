# Implementor B (api) — MIN-14 routes + MIN-15 lifecycle — memory

## 1. Files read / written

| Action | File | Why |
|---|---|---|
| read | `plans/002-ticket-core.md` | scope (Impl B §5), HTTP contract §3b, repo sigs §3c, state machine §4, tests §6, invariants §7 |
| read | `packages/shared/src/domain.ts` | frozen domain types (TicketStatus/BlockStatus/Ticket/Comment/TicketEvent) |
| read | `packages/core/src/{server,cli,index,server.test,integration.test}.ts` | existing patterns + DI seam |
| read | `packages/persistence/src/{index,database}.ts` | repo barrel exports + `Database.Database` handle type |
| read | `channels/ticket-core-channel.log` | A's confirmed repo/applyTransition signatures |
| read | `contexts/ticket-core-context.md` | deferred plan-approval guard note |
| write | `packages/core/src/lifecycle.ts` | pure MIN-15 state machine |
| write | `packages/core/src/lifecycle.test.ts` | 15 pure unit tests |
| write | `packages/core/src/routes/tickets.ts` | GET/POST/GET:id/PATCH:id tickets |
| write | `packages/core/src/routes/comments.ts` | GET/POST comments (oldest-first, 404/400) |
| write | `packages/core/src/routes/transitions.ts` | GET/POST transitions (canTransition + applyTransition) |
| write | `packages/core/src/routes/index.ts` | builds repos from db, registers all routes |
| write | `packages/core/src/routes.test.ts` | 11 route tests vs REAL temp SQLite (app.inject) |
| edit | `packages/core/src/server.ts` | `createServer(config, paths, db?)` registers routes when db present |
| edit | `packages/core/src/cli.ts` | capture `{db}` from `init`, thread into `createServer` |
| edit | `packages/core/src/index.ts` | export lifecycle (TRANSITIONS/canTransition/nextTransitions/TransitionContext) |
| posted | `channels/ticket-core-channel.log` | handshake to A + done msg to orchestrator |

## 2. Summary
Implemented MIN-15 lifecycle (pure state machine, no db) and the MIN-14 REST routes (tickets,
comments, transitions) backed by Impl A's `@otter/persistence` repos. Threaded the better-sqlite3
`db` handle `initPersistence().db → startApp → createServer(config, paths, db) → registerTicketCoreRoutes(app, db)`,
which builds repos via `createTicketRepository(db)` / `createCommentRepository(db)` and registers
routes; transitions use `applyTransition(db, …)` for an atomic status+event write. `/api/health` and
`/ws` unchanged; the `init` DI seam stays permissive (`db: unknown`) so unit tests inject a stub
(server only registers ticket routes when `db` is provided).

Lifecycle map (plan §4): created→[plannable,canceled]; plannable→[needs_user_approval,canceled];
needs_user_approval→[executable,plannable,canceled]; executable→[in_progress,plannable,canceled];
in_progress→[needs_user_review,failed,canceled]; needs_user_review→[done,in_progress,failed,canceled];
failed→[plannable,canceled]; done→[]; canceled→[]. Guards: `→in_progress` requires blockStatus==='none'
(ENFORCED); `planApproved` gates executable/in_progress but is PERMISSIVE for MVP (only blocks when
explicitly `false`) — deferred per user/context.

Status changes ONLY via POST /transitions (PATCH never touches status). Errors: `{error}` 400 bad
input / disallowed transition; 404 unknown ticket. GET /transitions returns `{current, next}` where
next = nextTransitions(current, ctx) so the UI never shows a disallowed action.

## 3. Gist
- A↔B handshake: A confirmed exact signatures (names match plan §3c verbatim); db = raw better-sqlite3
  `InitResult.db` (typed `Database.Database`, re-exported by @otter/persistence). Used that type
  end-to-end for type safety.
- Restart-equivalence proven: reopen same db file with a fresh handle + fresh server, data persists.
- Verify: `npx vitest run packages/core` → 5 files / 31 tests PASS (lifecycle 15, routes 11, plus
  existing cli/server/integration). `npx tsc -p packages/core/tsconfig.json --noEmit` → clean (exit 0).
