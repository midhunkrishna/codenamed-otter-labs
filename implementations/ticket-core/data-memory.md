# Implementor A (data) — MIN-14 persistence memory

## Files read / written
| File | R/W | Note |
|---|---|---|
| `plans/002-ticket-core.md` | R | full plan; my scope = Impl A §5, §3c/§3d, §6/A, §7 |
| `packages/shared/src/domain.ts` | R | frozen contract (Ticket/Comment/TicketEvent, isTicketStatus/isBlockStatus) |
| `packages/persistence/src/{index,database,migrations}.ts` | R | existing patterns |
| `packages/persistence/src/migrations/0001_init.sql` | R | base schema (ticket/comment append-only) |
| `packages/persistence/src/persistence.test.ts` | R | temp-dir test pattern (mkdtempSync + resolvePaths + initPersistence) |
| `channels/ticket-core-channel.log` | R/W | posted confirmed signatures + ACK + DONE |
| `packages/persistence/src/migrations/0002_ticket_core.sql` | W | additive migration |
| `packages/persistence/src/repositories/tickets.ts` | W | createTicketRepository |
| `packages/persistence/src/repositories/comments.ts` | W | createCommentRepository |
| `packages/persistence/src/repositories/events.ts` | W | createTicketEventRepository + row mapper |
| `packages/persistence/src/repositories/transitions.ts` | W | applyTransition |
| `packages/persistence/src/index.ts` | W | barrel exports added |
| `packages/persistence/src/repositories.test.ts` | W | 20 repo tests |

## What I implemented
- Migration `0002_ticket_core.sql` (additive only, 0001 untouched): `ticket.block_status TEXT NOT NULL DEFAULT 'none'`, `comment.metadata TEXT NOT NULL DEFAULT '{}'`, `ticket_event` table (id PK, ticket_id FK ON DELETE CASCADE, from_status nullable, to_status, detail, created_at ISO) + `idx_ticket_event_ticket`.
- Repos (factory(db) -> camelCase domain objects, ids via `crypto.randomUUID()`):
  - `createTicketRepository`: create (throws on empty/whitespace title; seeds status=created/block=none), get, list (created_at ASC, rowid ASC), update (bumps updated_at, never touches status), setStatus (value-validates via isTicketStatus/isBlockStatus, THROWS on invalid; returns undefined if ticket missing).
  - `createCommentRepository`: create (throws on empty/whitespace body; metadata defaults {}, must be plain JSON object else throws; stored as JSON string, parsed on read), listByTicket (oldest first).
  - `createTicketEventRepository`: listByTicket (oldest first).
  - `applyTransition(db,{ticketId,fromStatus,toStatus,detail})`: ONE `db.transaction` — setStatus(toStatus) + insert one ticket_event; throws+rolls back if ticket missing. Returns {ticket,event}.
- All exported from `src/index.ts`.

## Results
- `npx vitest run packages/persistence` → 29/29 PASS (9 existing + 20 new).
- `npx tsc -p packages/persistence/tsconfig.json --noEmit` → CLEAN.

## Gotchas / decisions (for B and C)
- **metadata default vs null**: used `metadata === undefined ? {} : metadata` (NOT `??`) so an explicitly-passed `null` is rejected, while omitted metadata defaults to `{}`. `??` would have let `null` slip through to `{}`.
- **noUncheckedIndexedAccess is ON** in tsconfig.base — array index access in tests needs `?.` (e.g. `evs[0]?.id`).
- **applyTransition deliberately does NOT validate transition legality** — that is core's (B's) job. It only requires the ticket to exist and validates the status *value* (via setStatus). B should map its throw to 404 and check legality in lifecycle.ts before calling.
- **Error → HTTP mapping for B**: repo `create`/`setStatus`/comment `create` THROW on bad input → 400; `get`/`update`/`setStatus` return `undefined` for unknown id → 404; `applyTransition` THROWS for missing ticket → 404.
- **DB handle**: pass the raw `initPersistence().db` (better-sqlite3 `Database.Database`) directly into the factories / applyTransition. Factories are cheap (statements prepared per-call), so per-request construction is fine.
- `import type { Database } from "@otter/persistence"` for the handle type; domain types from `@otter/shared`.
- `created_at` ties broken by `rowid ASC` since the ISO timestamp has only ms resolution and same-ms inserts are common in tests.
