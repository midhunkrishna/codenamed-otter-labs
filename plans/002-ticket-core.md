# Plan 002 — Ticket Core (MIN-14, MIN-15, MIN-16)

> Pattern: `actor.agent` (Orchestrator + Implementors). PROJECT-DIR = `/workspace/otter`.
> Branch: `ticket-core`. Builds on Plan 001 (foundations: `@otter/shared`, `@otter/persistence`, `@otter/core`, `@otter/web`).
> Stack unchanged: npm workspaces · Fastify · Vite+React+TS · Vitest · better-sqlite3.

## 1. Goal
Make tickets real and usable end to end:
- **MIN-14** durable ticket + comment persistence: tables, repositories, REST routes (list/create/read/update tickets; list/create comments). ISO timestamps. Append-only comments; valid-JSON metadata.
- **MIN-15** backend-owned lifecycle state machine over 9 states; transition endpoint; one system event per transition; expose valid next transitions to the UI.
- **MIN-16** first usable UI: Board with lifecycle columns, create-ticket flow, ticket card, ticket detail page, description editor, comment stream, backend-driven transition buttons.

## 2. Decisions (from deliberate-discovery with the user)
- **Plan-approval guard DEFERRED.** MIN-15 invariants "executable requires approved plan" and "in_progress requires approved plan and no block" — the plan-approval workflow does not exist yet (separate theme). The state machine enforces *structural* transitions + the `block_status` guard now, and exposes a typed `planApproved` guard hook that is **permissive for MVP**. This is called out explicitly in `contexts/ticket-core-context.md`. Wire real plan-approval in a later ticket.
- **Lifecycle events → dedicated `ticket_event` table** with a typed `ticket_id` FK (`ON DELETE CASCADE`). NOT polymorphic, NOT event-sourced; `ticket.status` remains an ordinary column.
- **Branch:** `ticket-core` off `master`. Commit only if the user asks.

## 3. Frozen contracts (orchestrator owns — implementors build against these)

### 3a. Domain types — `@otter/shared/src/domain.ts` (already written)
`TICKET_STATUSES` (9, order = display order), `TicketStatus`, `BLOCK_STATUSES`, `BlockStatus`,
`INITIAL_TICKET_STATUS='created'`, `INITIAL_BLOCK_STATUS='none'`, `isTicketStatus`, `isBlockStatus`,
and interfaces `Ticket`, `Comment`, `TicketEvent` (camelCase; DB columns are snake_case — repos map).
`@otter/web` does NOT import shared; it keeps a local mirror.

### 3b. HTTP contract (so web parallelizes without core source). All REST under `/api`.
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/tickets` | — | `200 Ticket[]` (created order, oldest first) | — |
| POST | `/api/tickets` | `{title, description?}` | `201 Ticket` (status=`created`, blockStatus=`none`) | `400` empty title |
| GET | `/api/tickets/:id` | — | `200 Ticket` | `404` |
| PATCH | `/api/tickets/:id` | `{title?, description?}` | `200 Ticket` (bumps updatedAt) | `404`, `400`. **Never changes status.** |
| GET | `/api/tickets/:id/comments` | — | `200 Comment[]` (oldest first) | `404` |
| POST | `/api/tickets/:id/comments` | `{body, author?, metadata?}` | `201 Comment` | `404`, `400` empty body / non-object metadata |
| GET | `/api/tickets/:id/transitions` | — | `200 {current: TicketStatus, next: TicketStatus[]}` | `404` |
| POST | `/api/tickets/:id/transitions` | `{to: TicketStatus, detail?}` | `200 Ticket` (status changed + event recorded, atomically) | `404`, `400` invalid/disallowed transition (clear message) |

- **Status is mutated ONLY via `POST /transitions`** — never via PATCH. Enforces "Claude never directly mutates status" / backend is sole lifecycle authority.
- Validation error body: `{ "error": string }`. 400 = bad input or disallowed transition; 404 = unknown ticket.

### 3c. Repository signatures — `@otter/persistence` (A↔B handshake; confirm via channel)
All repos are factory functions taking the better-sqlite3 `db`, generating `id`s (`crypto.randomUUID()`), and returning camelCase domain objects.
- `createTicketRepository(db)` → `{ create({title, description?}): Ticket; get(id): Ticket | undefined; list(): Ticket[]; update(id, {title?, description?}): Ticket | undefined; setStatus(id, status, blockStatus?): Ticket | undefined }`
  - `create` enforces non-empty title, sets status=`created`, blockStatus=`none`.
  - value-validates status against `TICKET_STATUSES` (rejects invalid — MIN-14 "invalid status is rejected").
- `createCommentRepository(db)` → `{ create(ticketId, {body, author?, metadata?}): Comment; listByTicket(ticketId): Comment[] }`
  - enforces non-empty `body`; `metadata` defaults `{}`, must be a JSON object (stored as JSON string; rejects non-object / non-serializable).
  - `listByTicket` returns oldest first (`ORDER BY created_at ASC, rowid ASC` for a stable tiebreak).
- `createTicketEventRepository(db)` → `{ listByTicket(ticketId): TicketEvent[] }`
- **`applyTransition(db, {ticketId, fromStatus, toStatus, detail})` → `{ ticket: Ticket; event: TicketEvent }`** — ONE transaction: updates `ticket.status` + `updated_at` and inserts a `ticket_event` row. Guarantees MIN-15 "every transition creates event record" atomically. Core decides *whether* to call it; persistence guarantees atomicity.

### 3d. Migration — `packages/persistence/src/migrations/0002_ticket_core.sql`
- `ALTER TABLE ticket ADD COLUMN block_status TEXT NOT NULL DEFAULT 'none';`
- `ALTER TABLE comment ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';`
- `CREATE TABLE ticket_event (id TEXT PK, ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (ISO now));` + `idx_ticket_event_ticket`.
- Migration runner is idempotent/append-only (0001 stays applied). New rows always set `status='created'` from the repo, so 0001's `status DEFAULT 'open'` is harmless and left untouched.

## 4. Lifecycle state machine (MIN-15, core-owned) — `packages/core/src/lifecycle.ts`
Transition map (structural). `*` guards explained below.
```
created            → plannable, canceled
plannable          → needs_user_approval, canceled
needs_user_approval→ executable*, plannable, canceled
executable*        → in_progress*, plannable, canceled
in_progress*       → needs_user_review, failed, canceled
needs_user_review  → done, in_progress, failed, canceled
failed             → plannable, canceled
done               → (terminal)
canceled           → (terminal)
```
- `TRANSITIONS: Record<TicketStatus, TicketStatus[]>`, `canTransition(from,to,ctx)`, `nextTransitions(from,ctx): TicketStatus[]`.
- Guards (MVP): `→ in_progress` requires `blockStatus==='none'` (enforced). `planApproved` hook gates `→executable`/`→in_progress` but is **permissive for MVP** (always true) — deferred per §2. `nextTransitions` returns only currently-allowed targets so the UI never shows a disallowed action.
- Tests must cover: created→plannable ✓; created→executable ✗; needs_user_approval→{executable,plannable} ✓; executable→in_progress ✓; transition records an event.

## 5. Actor split (3 Implementors, parallel)
| Impl | Tickets | Owns | Consumes |
|---|---|---|---|
| **A · data** | MIN-14 (data) | `packages/persistence/src/migrations/0002_ticket_core.sql`, `repositories/{tickets,comments,events}.ts`, `applyTransition`, barrel exports, repo tests | `@otter/shared/domain` (§3a) |
| **B · api** | MIN-14 (routes) + MIN-15 | `packages/core/src/lifecycle.ts`, `routes/{tickets,comments,transitions}.ts`, thread `db` from `startApp`→`createServer`→routes, route+lifecycle tests | A's repo signatures (§3c via channel), `@otter/shared/domain`, HTTP contract (§3b) |
| **C · web** | MIN-16 | `packages/web/src/**`: api client methods, Board + columns, create-ticket flow, TicketCard, TicketDetail (description editor + comment stream + transition buttons), local type mirror, tests | HTTP contract (§3b) only |

**Why this parallelizes:** orchestrator froze the domain types (§3a), HTTP contract (§3b) and repo signatures (§3c) up front. A and C are fully independent. B depends on A's repos but starts immediately against the frozen signatures, resolving the real handshakes over the channel (A↔B: repo/`applyTransition` shapes & db wiring; B↔C: any HTTP-shape clarifications).

## 6. Test mapping (red-green-refactor per implementor)
- **MIN-14 / A (persistence):** create ticket persists row; update bumps `updated_at`; create comment persists; comments oldest first; invalid status rejected; empty comment body rejected; non-object metadata rejected.
- **MIN-14 / B (routes):** POST/GET/PATCH tickets; GET/POST comments; persists across a fresh db handle (restart-equivalent); 404s; 400s.
- **MIN-15 / B (lifecycle):** the 5 ticket-listed cases above + invalid transition → 400 with clear error + event row written atomically.
- **MIN-16 / C (web):** board renders a created ticket; creating a ticket adds it to the board; adding a comment updates the comment stream; an invalid transition action is NOT shown (transitions come only from `GET /transitions`). fetch mocked; no real network.

## 7. Invariants (all tickets)
- Tickets & comments persist across restarts (SQLite is source of truth).
- Ticket id stable after creation; comments append-only; comment body non-empty; comment metadata valid JSON object.
- Backend is sole lifecycle authority; status changes only via `POST /transitions`; invalid transitions rejected with a clear error; every transition writes exactly one `ticket_event` (atomic with the status change).
- UI invents no lifecycle rules; only renders transitions returned by the backend; comments shown oldest first; detail refetches after mutations.
- API under `/api`; WS under `/ws` (unchanged from foundations).

## 8. Actor-pattern artifacts
- Plan: `plans/002-ticket-core.md` (this file).
- Context (orchestrator rollup): `contexts/ticket-core-context.md`.
- Channel: `channels/ticket-core-channel.log` (format `from: / to: / message:`).
- Implementor memory: `implementations/ticket-core/<implementor>-memory.md`.

## 9. Execution sequence
1. Orchestrator: branch + freeze domain contract (§3a) + write this plan/context/channel. *(done)*
2. Move MIN-14/15/16 → In Progress (user-authorized).
3. Spawn Implementors A, B, C in parallel (Agent Teams); each red-green-refactor; write memory + channel messages.
4. Orchestrator verifies: read impl files, confirm channel acks by code evidence, run `npm test` + `npm run typecheck`, tie up loose ends, update context.
5. Report. Commit only if the user asks.

## 10. Destructive-action gate
No destructive ops. Migration `0002` is additive (`ALTER ADD COLUMN`, `CREATE TABLE`) and never drops/rewrites existing data; runner never reruns `0001`. No new dependencies → no `npm install` needed. No commit/push unless asked.
