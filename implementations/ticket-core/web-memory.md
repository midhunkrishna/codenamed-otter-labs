# Implementor C (web) — MIN-16 memory

## 1. Files read / written

| File | R/W | Purpose |
|---|---|---|
| plans/002-ticket-core.md | R | Plan; scope = Impl C (§5), HTTP contract §3b, invariants §7 |
| channels/ticket-core-channel.log | R | Kickoff + A→B repo confirms (no web clarifications needed) |
| packages/web/src/App.tsx | R/W | App shell; wired `<Board/>` into the board nav view |
| packages/web/src/main.tsx | R | Entry pattern |
| packages/web/src/api/client.ts | R/W | Added domain mirror types + 8 client fns; POST/PATCH + error surfacing |
| packages/web/src/ws/client.ts | R | Same-origin URL pattern |
| packages/web/src/components/HealthBadge.tsx | R | Existing component pattern |
| packages/web/src/App.test.tsx | R | Test/fetch-mock pattern |
| packages/web/src/components/HealthBadge.test.tsx | R | Test pattern |
| packages/web/src/test/setup.ts | R | jest-dom setup |
| packages/web/{vite.config.ts,package.json,tsconfig.json} | R | Proxy, deps, ts config (no user-event installed → use fireEvent) |
| packages/web/src/components/status.ts | W | BOARD_COLUMNS (7), STATUS_LABELS, statusLabel |
| packages/web/src/components/TicketCard.tsx | W | Single card; click → onSelect |
| packages/web/src/components/CreateTicketForm.tsx | W | Create flow; POST then onCreated() refresh |
| packages/web/src/components/TicketDetail.tsx | W | Title, description editor (PATCH), comment stream (oldest first) + add form (POST), backend-driven transition buttons |
| packages/web/src/components/Board.tsx | W | 7 columns, create form, card→detail via React state |
| packages/web/src/components/Board.test.tsx | W | 4 §6/C tests (fetch-mocked fake backend) |

## 2. Summary
Built the MIN-16 Board + Ticket detail UI in @otter/web, standalone (no @otter/shared
import; local type mirror in api/client.ts). Extended the existing `request()` wrapper to
support POST/PATCH and to surface the backend `{error}` message. Added client fns:
listTickets, createTicket, getTicket, updateTicket, listComments, createComment,
getTransitions, postTransition. Board renders the 7 active-lifecycle columns (Created,
Plannable, Needs Approval, Executable, In Progress, Needs Review, Done); canceled/failed
are not columns. View switching is React state (no router): selecting a card opens
TicketDetail. Detail shows the description editor, comment stream (oldest first as served),
add-comment form, and transition buttons built ONLY from GET /transitions `next`. Every
mutation (create, patch description, add comment, transition) refetches before the parent
board refreshes — the refetch-after-mutation invariant.

## 3. Gist
- Transition buttons are 100% backend-driven: `transitions.next.map(...)`. The UI invents
  no lifecycle rules; an action absent from `next` is never rendered (test asserts this).
- Comments rendered in server order (oldest first per contract); test asserts ordering and
  that the stream updates after POST.
- All API via same-origin `/api` relative URLs through `request()` → Vite proxy to :4873.
- No new deps; tests use fireEvent (no user-event installed) + a mocked fetch fake backend.

## 4. Verification
- `npx vitest run packages/web` → 7 passed (3 files; 4 new in Board.test.tsx).
- `npx tsc -p packages/web/tsconfig.json --noEmit` → clean.
- `npm -w @otter/web run build` → green (37 modules, dist built).
