# Ticket Core — Orchestrator Context

Rollup of sub-agent progress for plan `002-ticket-core.md` (MIN-14, MIN-15, MIN-16).
Updated by the Orchestrator. Builds on the completed foundations (`001-foundations.md`).

## Status — COMPLETE ✅
- [x] Phase 1: branch `ticket-core` + frozen domain contract (`@otter/shared/src/domain.ts`) + plan/context/channel scaffolded (orchestrator)
- [x] Phase 2: tickets MIN-14/15/16 → In Progress
- [x] Phase 3: Implementor A (data / MIN-14 persistence)
- [x] Phase 3: Implementor B (api / MIN-14 routes + MIN-15 lifecycle)
- [x] Phase 3: Implementor C (web / MIN-16)
- [x] Phase 4: verification — **78/78 tests pass**, 4 packages typecheck clean, real socket boot + restart-persistence verified

## ⚠️ Deferred decision (per user) — plan-approval guard
MIN-15 lists invariants **"executable requires approved plan"** and **"in_progress requires approved plan
and no block"**. The plan-approval workflow does not exist yet (separate theme), so per the user's explicit
direction this guard is **DEFERRED**:
- The state machine enforces *structural* transitions and the `block_status` guard (`→ in_progress`
  requires `blockStatus === 'none'`) now.
- It exposes a typed `planApproved` guard hook that is **permissive for MVP** (always returns true).
- When the plan-approval theme lands, wire `planApproved` to "an approved `plan` row exists for the ticket"
  and remove this note. Until then, `→ executable` / `→ in_progress` are NOT gated on a plan.

## Frozen contracts (see plan §3 for detail)
- Domain types: `@otter/shared/src/domain.ts` (statuses, block statuses, `Ticket`/`Comment`/`TicketEvent`).
- HTTP: tickets CRUD + comments + `GET/POST /api/tickets/:id/transitions`. Status changes ONLY via
  `POST /transitions`. Errors `{error}`; 400 bad input / disallowed transition, 404 unknown ticket.
- Repos (`@otter/persistence`): `createTicketRepository`, `createCommentRepository`,
  `createTicketEventRepository`, and transactional `applyTransition(db, …)`.
- Migration `0002_ticket_core.sql`: `block_status` on ticket, `metadata` on comment, new `ticket_event` table.

## Implementor summaries
**A · data / MIN-14 (persistence)** — `migrations/0002_ticket_core.sql` (additive: `ticket.block_status` DEFAULT `none`, `comment.metadata` DEFAULT `{}`, new `ticket_event` table + index; 0001 untouched). Repos under `src/repositories/{tickets,comments,events,transitions}.ts`, exported from `src/index.ts`: `createTicketRepository`, `createCommentRepository`, `createTicketEventRepository`, and transactional `applyTransition(db, …)` (atomic status+updatedAt+one event; throws+rolls back if ticket missing). Value-validation: empty title/body and non-object metadata throw; invalid status value throws. `29/29` persistence tests; tsc clean.

**B · api / MIN-14 routes + MIN-15 lifecycle** — `src/lifecycle.ts` (TRANSITIONS map per plan §4, `canTransition`, `nextTransitions`; `→in_progress` requires `blockStatus==='none'`; `planApproved` permissive per deferral). `src/routes/{tickets,comments,transitions,index}.ts`. Wired `db` through `startApp → createServer(config,paths,db) → registerTicketCoreRoutes`. Status changes ONLY via `POST /transitions`; PATCH never touches status. `31` core tests (15 lifecycle + 11 routes via `app.inject` on REAL temp SQLite + existing); tsc clean.

**C · web / MIN-16** — `src/components/{Board,TicketCard,CreateTicketForm,TicketDetail,status}.tsx`; Board wired into App's board nav view (shell/nav/HealthBadge intact). `api/client.ts` extended (POST/PATCH + `{error}` surfacing) with `listTickets/createTicket/getTicket/updateTicket/listComments/createComment/getTransitions/postTransition` + local mirror types. 7 columns exactly (Created…Done). Transition buttons rendered ONLY from `GET /transitions.next` (UI invents no rules). Every mutation refetches. `7` web tests; tsc clean; `vite build` green.

## Channel verification (acks confirmed by code evidence)
- **A↔B (repo signatures + db wiring):** B posted the exact signatures it would build against; A ACKed "names match plan §3c verbatim, no deltas" and confirmed throw/undefined → 400/404 mapping. Evidence: `core/src/routes/*` import the real `@otter/persistence` factories + `applyTransition`; `core/src/routes.test.ts` runs them against a real temp SQLite (green); `cli.ts`/`server.ts` thread the real `Database.Database` handle.
- **B↔C (HTTP shape):** C built against the frozen §3b contract (no clarification needed). Evidence: live boot returned exactly the shapes web's mirror types expect — `{current,next}` transitions, `Ticket`/`Comment` payloads, `{error}` bodies on 400.

## Live verification (real socket + SQLite, fresh data dir)
Booted `createServer` + real `initPersistence` on a port; migrations `0001`+`0002` applied. Verified: create ticket → `status=created, blockStatus=none`; `GET /transitions` → `{created → [plannable,canceled]}`; invalid `created→executable` → `400 {error:"transition created → executable is not allowed"}`; valid `created→plannable` → 200 (updatedAt bumped, one `ticket_event` row recorded); empty comment → 400; **PATCH `status=done` ignored** (stays `plannable` — backend authority); **restart** (fresh process, same DB) → migrations `[]` (idempotent), ticket + comments persisted, comments oldest-first.

## Loose ends / follow-ups (non-blocking)
- **FIXED: `npm start` CLI boot.** Root cause was a tsx 4.22.3 bug: `transformDynamicImport` only parses files containing a dynamic `import()`, and its lightweight parser chokes on TS `import type` syntax — `cli.ts` was the only file with both. Fix: made the `@otter/persistence` import in `cli.ts` static (`import { initPersistence } from "@otter/persistence"`) instead of a lazy `await import(...)` in `defaultInit`; the lazy rationale was obsolete (persistence is now a hard, built dependency). Removing the only dynamic import means the buggy transform never runs. Verified: `npm start` boots and serves `/api/health` + ticket routes; full suite still 78/78; all packages typecheck clean.
- **DEFERRED plan-approval guard** still pending (see warning above) — wire `planApproved` when the plan-approval theme lands.
- Tickets MIN-14/15/16 left in Linear **In Progress** (no instruction to move to Done; awaiting review/commit).
