# Impl-D — Integration & Preview (plan 003-design-system, MIN-43)

Wave-2 integrator. Adopted the shell, migrated the existing board surfaces onto
the Wave-1 primitives, and built the `/preview` Components gallery. Did NOT touch
the frozen seam or any Wave-1 implementation file.

## Files

| File | Change | Why |
|------|--------|-----|
| `src/main.tsx` | modified | Wrap app in `<ThemeProvider>`; import `./design/global.css` once at entry. |
| `src/App.tsx` | rewritten | Replace hand-rolled shell with `<AppShell>` + `<Sidebar>`; topbar with `<h1>` + `HealthBadge`; sidebar footer hosts `<ThemeControls>`. NAV_ITEMS extended with `attention` + `components` (now 7). Board → live `<Board>`, Components → `<PreviewRoute>`, others → `<EmptyState>` placeholder. |
| `src/app/ThemeControls.tsx` (+.css.ts) | new | Theme (4) + density (3) `<select>` pickers wired to `useTheme`/`useDensity`. Reused by shell + preview. Theme/density labels live here (tokens.ts frozen, has none). |
| `src/app/App.css.ts` | new | vanilla-extract styles for shell brand/topbar/footer, board grid+columns, the card-wrapper button reset, themed form inputs, and ticket-detail sections. All via contract `vars`/`space` — no raw colors. |
| `src/components/Board.tsx` | modified | Renders each ticket via `ui/TicketCard` (was `components/TicketCard`). Derives `owner` via `ownerForTicket`. Keeps 7 `BOARD_COLUMNS`, the `data-testid="ticket-card-<id>"`, and click-to-open. Card wrapped in a `<button>` that owns the testid + onClick (TicketCardProps has no data-testid/spread). |
| `src/components/status.ts` | modified | Added `ownerForTicket(status, blockStatus): Owner` mapping. |
| `src/components/CreateTicketForm.tsx` | modified | `<Button>` + themed inputs; preserved behavior, aria-labels, error `role="alert"`, "Create ticket" name. |
| `src/components/TicketDetail.tsx` | modified | `<PageHeader>`/`<Pill>`/`<Button>`; preserved ALL behavior (see below). |
| `src/components/TicketCard.tsx` | deleted | Replaced by `ui/TicketCard`; nothing imported it. |
| `src/preview/PreviewRoute.tsx` (+.css.ts) | new | Components gallery: all 20 primitives, TicketCard ×9 statuses (+blocked), AttentionCard ×5 types (+expanded), ApprovalCard ×4 risks, PlanCard/FormCommentCard states, VerificationPacketTabs 4 lenses. Live `<ThemeControls>`. `data-testid="preview-route"`. |
| `src/App.test.tsx` | rewritten | Renders inside `<ThemeProvider>`; asserts root theme class applied + switches on picker change (no crash); all 7 nav buttons present (incl. original 5); navigates to preview route. |

## Owner-derivation mapping (Ticket has no owner field)

`ownerForTicket(status, blockStatus)`:
- `blockStatus === "blocked"` → **blocked** (amber stripe), overrides status.
- **user**: `created`, `plannable`, `needs_user_approval`, `needs_user_review` (user must act next).
- **agent**: `executable`, `in_progress` (agent is/should be working).
- **system**: `done`, `canceled`, `failed` (terminal, system-owned).

Rationale: the design language's ownership stripe answers "who makes the next
move." User-action states are warm, agent-execution states are cool, terminal
states are neutral/system, and a block guard always wins (amber).

## Behavior preserved carefully

- **TicketDetail transitions** render ONLY from `GET /transitions.next` (the
  `transitions.next.map`), never hardcoded — invariant kept verbatim.
- **Comments oldest-first**: list renders `comments` in server order under
  `data-testid="comment-stream"` as `<li>`s.
- **Refetch after every mutation**: `load()` still called after save / comment /
  transition, then `onMutated()`.
- **PATCH never changes status**: `updateTicket` still only sends `description`.
- Accessible names kept: regions "Ticket detail" / "Transitions" / "Comments";
  buttons "Back to board" / "Save description" / "Add comment"; transition
  buttons keep `statusLabel(to)`; form aria-labels unchanged.
- **HealthBadge** left unchanged (kept `data-testid="health-badge"`, "backend: ok")
  — its test stays green untouched.

## Verification (all green)

- `npx vitest run` → **8 files, 108 tests passed** (was 106; +2 net App tests).
- `npx tsc -p tsconfig.json --noEmit` → **exit 0**.
- `vite build` → **succeeded**, 125 modules, `index.css` 29.17 kB (vanilla-extract
  compiled for production).

## Gist

Single ThemeProvider at the entry, one `global.css` import, shell via AppShell +
Sidebar, density/theme switchable live from the sidebar footer and the preview
page. Board/detail/form now consume the primitive library with identical
behavior. Raw-color guard unaffected (preview/app css live outside `ui/` and use
only contract vars).
