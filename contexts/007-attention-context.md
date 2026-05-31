# Plan 007 — Attention (MIN-36 / MIN-37 / MIN-38) — Context Rollup

> **Status:** ✅ Complete. Full suite green: **398 tests / 37 files** (was 346). Branch
> `007-attention` (off `master`), **no commit yet** (awaiting user review, per project
> CLAUDE.md). Plan: `plans/007-attention.md`. Tickets MIN-36/37/38 are **In Progress** in
> Linear (not moved to Done — awaiting approval).

---

## 1. What this theme delivers

The **unified user action queue** ("Attention"):
- **MIN-36** — canonical `attention_items` model + repository + REST API (list/filter/focus/
  dismiss/resolve), 6-value `attention_type` enum, source linkage, lazy expiry, events.
- **MIN-37** — Attention page with sibling filters (All/Permissions/Plans/Questions/
  Verification/Failures), live count badges, WS-driven queue that doesn't steal focus.
- **MIN-38** — expandable in-place cards with per-`attention_type` expanded content, sticky
  while acting, generic fallback for unknown types.

## 2. Decisions locked (see plan §0)

1. New canonical `attention_items` table **+ repoint** the shipped plan-006 producers
   (orchestrator, plan-approval routes, AttentionPage); migration `0005` additive + backfill;
   legacy `attention_item` left dormant.
2. Only `plan_approval` is a **live producer**; the other 5 producers deferred → **D-007-1**
   in `contexts/deferred.md`.
3. Minor: lazy expiry (no sweeper), additive `attention_item_updated` event, frontend
   `attention_type` re-keyed to the 6 canonical values.
4. **Focus is NOT persisted** (post-review refinement). Only *action outcomes* are stored
   (`resolved`/`dismissed`) plus the system-derived `expired`/`superseded`; `open` is the sole
   active state. Focus/expansion stays purely client-side (`AttentionPage`'s `expandedId`).
   Removed: the `focused` status from the enum, the `focus()` repo method, the partial-unique
   index narrowed to `WHERE status = 'open'` (renamed `idx_attn_items_one_open`), the
   `POST /api/attention/:id/focus` endpoint, and the web `focusAttention` call.

## 3. Work split (4 implementors — Agent Teams)

| Impl | Owns | Depends on |
|---|---|---|
| A · persistence/shared | `shared/attention.ts`+`events.ts`, `0005_attention.sql`, repo, persistence tests | — (foundation) |
| B · core api/producers | `routes/attention.ts`, repoint orchestrator + plans.ts, core tests | A (repo sig) |
| C · web page | `api/attention.ts`, `AttentionPage.tsx`, page tests | D (card), B (api) at runtime |
| D · web cards | `ui/AttentionCard`+`ExpandedAttentionCard`+`AttentionItemCard`, tokens, card tests | C (VM type) |

Channel: `channels/007-attention-channel.log`. Per-agent memory:
`implementations/007-attention/impl-{a,b,c,d}-memory.md`.

## 4. What got built (by implementor)

- **Impl-A · persistence + contract.** Rewrote `shared/attention.ts` (canonical §1.1) +
  `events.ts` (+`attention_item_updated`); migration `0005_attention.sql` (canonical
  `attention_items` table, 3 indexes incl. partial-unique on active (source,type), backfill
  from legacy `attention_item`); rewrote repo `createAttentionRepository` (idempotent `open`,
  lazy-expire, enum-validated, `focus`/`dismiss`/`resolve`/`resolveBySource`). Persistence
  59→**82** tests. Removed obsolete legacy-attention tests from `planning.test.ts`.
- **Impl-B · core API + repoint.** New `routes/attention.ts` (`GET /api/attention` with
  status/attention_type/project/ticket filters; `POST /api/attention/:id/{focus,dismiss,
  resolve}` → `{item}`, 404 on missing, persist-then-emit). Repointed `orchestrator.ts`
  (`open({attentionType:'plan_approval',sourceType:'plan',sourceId:plan.id,…})`) and
  `routes/plans.ts` (`resolveBySource('plan',plan.id,'plan_approval')`); removed legacy
  `GET /attention`. Core 130/4-fail → **143/0**.
- **Impl-C · web page (MIN-37).** Rewrote `api/attention.ts` (web VM mirror + calls — the
  type Impl-D imports), `AttentionPage.tsx` (sibling filters All/Permissions/Plans/Questions/
  Verification/Failures with live count badges, recovery-first HTTP+WS, queue stability via
  tracked `expandedId`). Page suite 3→6.
- **Impl-D · web cards (MIN-38).** Re-keyed `design/tokens.ts` attention section to the 6
  canonical values (+`ATTENTION_FILTER_GROUPS`); new `AttentionItemCard.tsx` (collapsed↔
  sticky-expanded, per-`attentionType` bodies reusing PlanCard/VerificationPacketTabs/
  FormCommentCard/ApprovalCard/CodeBlock, generic fallback, no auto-collapse on refetch).
  `plan_approval` is fully wired (approve/send-back → `onResolved`); the other 5 render full
  context + source link + **disabled** primary actions noted "available when <theme> ships"
  (their producers/APIs are D-007-1). Web 142→**162** tests; raw-color guard 49/49.

## 5. Orchestrator tie-up (actor §7) — verified

- **Full integrated suite GREEN: 396 tests** — shared 11 · persistence 81 · core 142 · web
  162. `tsc --noEmit` clean in all 4 packages. (was 346 at end of plan 006; net of the
  focus-not-persisted removal — see decision §2.4.)
- **Channel acks backed by code** (`channels/007-attention-channel.log`): A→B handshake (B
  imports `createAttentionRepository`, calls `resolveBySource`, consumes `OpenAttentionInput`);
  C→D handshake (D imports `AttentionItemVM`/`resolveAttention`/`dismissAttention` from C's
  `api/attention.ts`, preserved C's `data-testid` page contract). No deviations from plan §1.
- **Additive guarantee verified:** migration `0004` untouched; legacy `attention_item` table
  dormant (not dropped); `0005` backfills its rows. No leftover legacy API refs in source.
- **Deferred recorded:** D-007-1 in `contexts/deferred.md` (live producers for the other 5
  attention_types ship with their owning themes: permissions, MIN-27 forms, MIN-39–42
  verification, execution/MIN-46).

## 6. Still open / next

- **D-007-1** — live producers + real source actions for `permission_request`,
  `clarification_required`, `verification_review`, `execution_failed`, `run_stalled`.
- **No commit / no push / no Linear "Done"** without explicit user approval. Tickets
  MIN-36/37/38 sit **In Progress**. Branch `007-attention`, uncommitted.
- Minor: hash-anchor source links (`#/runs/<id>` etc.) are placeholders — no web router yet.
