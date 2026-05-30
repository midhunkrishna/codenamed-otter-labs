# Impl-C — Domain primitives (plan 003-design-system, MIN-43)

Branch: `design-system`. Scope: product-specific cards in `packages/web/src/ui/`,
built ON TOP of Impl-B's generic primitives + the frozen `design/` contract.

## Files

| File | Purpose |
|------|---------|
| `ui/TicketCard.tsx` + `.css.ts` | Ticket card: owner stripe, phase-chip eyebrow w/ agent pulse + progress, mono key, title, pills, foot meta, amber block stripe. **Bespoke** (not via Card). |
| `ui/AttentionCard.tsx` + `.css.ts` | Collapsed attention card: `type` accent (left stripe) + `priority` tone, title/summary/requiredAction/ticketKey, clickable. Exports shared `AttentionHeader`. **Bespoke.** |
| `ui/ExpandedAttentionCard.tsx` + `.css.ts` | Reuses `AttentionHeader` + adds source-specific `children` body + `sticky`. `.css.ts` re-exports AttentionCard styles. **Bespoke.** |
| `ui/ApprovalCard.tsx` + `.css.ts` | actor/intent lede + **risk Pill (B)** + verbatim **CodeBlock (B)** command + facts **MetadataRow (B)** + Approve/Deny/Revise **Buttons (B)**. **Composes B.** |
| `ui/PlanCard.tsx` + `.css.ts` | mono version + state **Pill (B)** (PlanState→status.* tone) + title/meta + collapsible children + Approve/Reject **Buttons (B)** (only when proposed). **Composes B.** |
| `ui/FormCommentCard.tsx` + `.css.ts` | agent-asks header; `blocking && state==='open'` → bright-red **Pill (B)** `risk.critical` "Blocks ticket"; children + footer; non-open states render muted. **Composes B.** |
| `ui/VerificationPacketTabs.tsx` + `.css.ts` | 4 lenses Walkthrough·Verify·Facts·Why (from `VERIFICATION_TABS`), `activeTab`/`onSelect`, shows active node. **Bespoke** tablist (verification-specific prop shape, not B's generic Tabs). |
| `ui/domain.test.tsx` | 15 tests, all green (rendered without ThemeProvider). |

## Impl-B primitives: reused vs. bespoke

- **Reused (composed real B imports):** `Pill` (ApprovalCard risk, PlanCard state, FormCommentCard blocking), `Button` (ApprovalCard/PlanCard actions), `CodeBlock` (ApprovalCard verbatim command), `MetadataRow` (ApprovalCard facts grid). These map 1:1 onto the frozen prop API and B confirmed signatures on the channel.
- **Bespoke (contract vars only, no B Card):** TicketCard, AttentionCard, ExpandedAttentionCard, VerificationPacketTabs — each owns product-specific affordances the generic Card/Tabs don't model (agent pulse + progress bar, attention type accent stripe + priority tone, verification tab shape with `VerificationTab` typing). Still themed purely via `vars`/`space`/semantic tones, so they recolor on theme switch identically to Card.

## How key directives were handled

- **Agent pulse:** a `@vanilla-extract` `keyframes` 1.6s ease-in-out infinite scale/opacity dot, rendered ONLY when `phase.owner==='agent'`. `prefers-reduced-motion` disables it. It is the single continuous animation. User/system phases get no pulse, no progress bar (asserted in tests).
- **Progress bar:** rendered only for agent phase with a numeric `percent`; width clamped 0–100; `role=progressbar` + aria-valuenow.
- **Block stripe:** `blockStatus==='blocked'` renders the amber banner (`ownerBlockedSoft`/`ownerBlocked`) with `blockReason`, AND shifts the left owner stripe to `ownerTone.blocked` (amber) regardless of `owner` — `data-owner-stripe="blocked"`.
- **No raw colors:** every color is a contract-var reference (`vars.color.*`) or a semantic tone (`statusTone`/`ownerTone`/`riskTone`/`attentionTone`). Priority (no token map exists) is mapped to contract `toneGray/Blue/Orange/Red` vars locally — still var references, passes the guard. Inline styles only ever set `var(--…)` references, never literals.

## Tests

`cd packages/web && npx vitest run src/ui/domain.test.tsx` → **15/15 pass**.
Covers: TicketCard owner stripe + status tone (data-attrs + var-ref) + pulse/progress gating + block stripe + onClick; AttentionCard type+priority tone; ExpandedAttentionCard header+body+sticky; ApprovalCard risk pill + verbatim command + facts + 3 actions; PlanCard version+state pill+toggle+actionable gating; FormCommentCard blocking pill open vs submitted; VerificationPacketTabs all 4 lens labels in order + active section + onSelect.

## Gotchas / notes for orchestrator

- Full `src/ui` run = 35 pass / 5 fail. **All 5 failures are in Impl-B's `core.test.tsx`** (Pill/Badge), NOT mine. Root cause (flagged to B on channel): B applies `style={{ [styles.toneFg]: x }}` where `styles.toneFg` is already a `var(--…)` reference, so React logs "Unsupported style property var(--toneFg__…)" and the inline custom prop isn't set — B needs the bare custom-property name (or `assignInlineVars`). My cards assert on `data-tone`/text, so they stay green, but B's color application needs the fix before visual themes resolve correctly.
- Did NOT edit any frozen seam, `design/*`, barrels, B's files, `App.tsx`, or `components/*`.
- Did NOT run a full project typecheck/build (other tracks' files expected-missing per directive).
