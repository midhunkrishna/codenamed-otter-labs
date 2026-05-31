# Impl-C memory — Plan 007 Attention (MIN-37 + web api/attention.ts VM)

## Scope
Web Attention page (sibling filters + live queue) and the web API mirror
`api/attention.ts` (the VM type Impl-D imports). Web is standalone/node-free —
no `@otter/shared`; all types are local camelCase mirrors of the §1.1 contract.

## Files read
| file | why |
|---|---|
| plans/007-attention.md | §1.5 web mirror + card contract, §1.6 type→filter map, §2 Impl-C |
| web/src/api/attention.ts (old) | legacy MIN-23 shape to rewrite |
| web/src/components/AttentionPage.tsx + .test.tsx (old) | rewrite targets |
| web/src/App.tsx + App.test.tsx | nav routing (already wired); sidebar-link test |
| web/src/ws/events.ts | connectEvents/CHANNELS.attention; EVENT_TYPES |
| web/src/api/client.ts | `request` helper |
| web/src/components/RunsConsole.tsx + .css.ts | recovery-first HTTP-then-subscribe pattern + .css.ts conventions |
| web/src/ui/{index,types,Badge,Pill,Button}.tsx, design/{tokens,contract.css}.ts | primitives + tokens |

## Files written
| file | what |
|---|---|
| web/src/api/attention.ts | REWRITE → canonical VM mirror + endpoint calls (owns the contract D imports) |
| web/src/components/AttentionPage.tsx | REWRITE → filter row + live count badges + live queue + queue stability |
| web/src/components/AttentionPage.css.ts | NEW → filter-row + list styles (vanilla-extract, design tokens) |
| web/src/components/AttentionPage.test.tsx | REWRITE → MIN-37 test list (6 tests) |
| web/src/ws/events.ts | EDIT → append `attention_item_updated` to EventType union (additive) |
| web/src/ui/index.ts | EDIT → export `AttentionItemCard` from barrel (D's component) |
| web/src/ui/AttentionItemCard.tsx | TEMP placeholder (frozen §1.5 props) — later OVERWRITTEN by Impl-D's real card |

## What I implemented
- **api/attention.ts (FROZEN, posted to channel first):**
  - `type AttentionType` = 6 canonical values.
  - `interface AttentionItemVM` = camelCase mirror (id, projectId, attentionType,
    sourceType, sourceId, ticketId|null, runId|null, status, priority, title,
    summary, requiredAction, metadata, createdAt, updatedAt, resolvedAt|null,
    dismissedAt|null, expiresAt|null).
  - Also exports `AttentionSourceType`, `AttentionStatus`, `AttentionPriority`,
    `AttentionListFilter`.
  - `listAttention(filter?: AttentionListFilter | AttentionStatus)` → builds
    `?status=&attention_type=&project=`; a bare string is a `status` shorthand
    (used by the page's `listAttention('open')`).
  - `focusAttention/dismissAttention/resolveAttention(id)` → POST
    `/attention/:id/{focus,dismiss,resolve}`, unwrap `{ item }`.
- **AttentionPage.tsx (MIN-37):**
  - Sibling filter row All/Permissions/Plans/Questions/Verification/Failures,
    each a `role="tab"` button with a live count `<Badge>`.
  - Recovery-first: HTTP `listAttention('open')` on mount, then `connectEvents`
    subscribe to `CHANNELS.attention`, refetch on
    `attention_item_{created,resolved,updated}`. Shared events client owned via
    a ref, closed on unmount (RunsConsole pattern).
  - Queue stability: `expandedId` state; a live refetch swaps the items array
    but never resets `expandedId` → focused card stays expanded + in place; new
    items append (backend returns newest-first... see "learned" below).
  - Filtered view computed from the full item set; counts computed over the full
    set so badges reflect totals regardless of the active filter.
  - Passes every item (incl. unknown attentionType) straight to the card.
- **Filter → attention_type map (implemented, §1.6):**
  - All → everything
  - Permissions → `permission_request`
  - Plans → `plan_approval`
  - Questions → `clarification_required`
  - Verification → `verification_review`
  - Failures → `execution_failed` ∪ `run_stalled`

## Integration with Impl-D's card
- Page imports `AttentionItemCard` from the `../ui` barrel and renders it with the
  frozen §1.5 props `{ item, expanded, onToggleExpand, onResolved }`.
- D landed the real card (overwrote my placeholder); typecheck + `vite build` are
  GREEN with it. My AttentionPage.test.tsx mocks the card (test double honouring
  the prop contract) so MIN-37 is unit-tested independently of D's per-type bodies.

## Tests
- Before: AttentionPage.test.tsx = 3 tests (legacy MIN-23, drawer flow).
- After: AttentionPage.test.tsx = 6 tests (sidebar link, All shows all, each
  filter shows its type(s), Failures shows both, unknown type renders w/o crash,
  WS item appears without collapsing/moving the focused card + subscribe/refetch).
- My lane GREEN. Full web suite 148 pass / 14 fail — all 14 failures are in
  Impl-D's `src/ui/AttentionItemCard.test.tsx` (D's MIN-38 lane, not mine).
- `tsc --noEmit` clean; `vite build` succeeds.

## Learned / notes
- `noUncheckedIndexedAccess` is on: `FILTERS[0]`/`cards[0]` are `T | undefined`.
  Used a named `ALL_FILTER` constant as the fallback and `?.` in the test.
- App.tsx already routed `attention` → `<AttentionPage/>` and NAV_ITEMS already
  had Attention; no App change needed. App.test "renders every nav destination"
  already asserts the Attention sidebar link.
- Live "append" ordering: the page refetches the authoritative newest-first list
  rather than splicing; queue stability is about not RESETTING the expanded id /
  not scrolling, which the page guarantees. In the test the new item is appended
  after the focused one so document order is asserted directly.
- events.ts only delivers data (never scrolls/focuses) — all focus preservation
  is page-owned, consistent with the MIN-32 transport invariant.
