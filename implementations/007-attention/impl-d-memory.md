# Impl-D memory — MIN-38 (web expandable attention cards)

## Files read
| file | why |
|---|---|
| plans/007-attention.md | full plan; §1.5 card contract, §1.6 tone/label/filter map |
| web/src/ui/AttentionCard.{tsx,css.ts} | collapsed card to migrate + reuse header |
| web/src/ui/ExpandedAttentionCard.{tsx,css.ts} | sticky expanded shell to reuse |
| web/src/ui/types.ts | AttentionCardProps / ExpandedAttentionCardProps |
| web/src/design/tokens.ts | ATTENTION_TYPES/attentionTone/ATTENTION_LABELS re-key target |
| web/src/api/attention.ts (Impl-C, §1.5) | VM type + resolve/dismiss/focus calls I import |
| web/src/api/plans.ts | approvePlan / sendBackPlan (the live path) |
| primitives: PlanCard, ApprovalCard, VerificationPacketTabs, FormCommentCard, MetadataRow, CodeBlock, Button | expanded bodies |
| web/src/ui/index.ts | barrel (already exported AttentionItemCard — C's placeholder) |
| web/src/design/no-raw-colors.test.ts | raw-color guard I must keep green |
| web/src/components/AttentionPage.test.tsx | C's selectors I must preserve (data-testid, data-expanded) |
| web/src/ui/domain.test.tsx, core.test.tsx, preview/PreviewRoute.tsx | callers of old AttentionType values |

## Files written
| file | change |
|---|---|
| web/src/design/tokens.ts | re-keyed ATTENTION_TYPES to the 6 canonical values; attentionTone (run_stalled shares red); ATTENTION_LABELS; NEW ATTENTION_FILTER_GROUPS + attentionFilterGroup map (§1.6) |
| web/src/ui/AttentionItemCard.tsx | OVERWROTE C's placeholder — real §1.5 card |
| web/src/ui/AttentionItemCard.css.ts | NEW styles (contract vars only) |
| web/src/ui/AttentionItemCard.test.tsx | NEW — MIN-38 test list (14 tests) |
| web/src/preview/PreviewRoute.tsx | ATTENTION_PRIORITY keys, Pill tone, ExpandedAttentionCard type → canonical |
| web/src/ui/domain.test.tsx | AttentionCard/ExpandedAttentionCard type values + expected labels |
| web/src/ui/core.test.tsx | badgeTone "attention.permission_request" |

AttentionCard.tsx / ExpandedAttentionCard.tsx code needed NO change — they key
attentionTone[type]/ATTENTION_LABELS[type] generically; only the token enum changed.

## What was implemented
- Token re-key to canonical `attention_type` per §1.6 (permission_request→amber,
  plan_approval→blue, clarification_required→violet, verification_review→orange,
  execution_failed→red, run_stalled→red). Added filter-group map.
- AttentionItemCard: collapsed AttentionCard (click title to expand) ↔ sticky
  ExpandedAttentionCard with per-attentionType body. data-testid="attention-card-<id>"
  + data-expanded preserved (C's page contract). Parent owns `expanded` so a refetch
  never auto-collapses (verified by test).
- plan_approval = ONLY fully-wired live path: Approve→approvePlan, Reject→inline
  send-back textarea→sendBackPlan, then onResolved(). 5 other types render full
  context (ApprovalCard / VerificationPacketTabs / FormCommentCard / CodeBlock+facts /
  MetadataRow) with DISABLED source-specific buttons + "Action available when <theme>
  ships" note (D-007-1). Generic Dismiss/Mark-resolved always wired
  (dismissAttention/resolveAttention). Unknown type → generic fallback (never throws).
- Always-present source link: #/runs/<runId> | #/tickets/<ticketId> | #/source/<sourceId>
  (hash anchor; no router exists yet; testable via data-run-link/data-ticket-link).

## Learned
- C already posted §1.5 api/attention.ts (AttentionItemVM, AttentionType, resolve/
  dismiss/focus). C also left a placeholder AttentionItemCard I overwrote, keeping the
  data-testid/data-expanded contract its page tests drive.
- App routing is component-state, not URL — so the source link is a plain hash anchor.
- Collapsed AttentionCard is a single <button>; its accessible name concatenates all
  header text (test matches title as substring).

## Results
- web suite: 142 → 162 tests (14 new in AttentionItemCard.test + page/domain growth), all green.
- typecheck (tsc --noEmit) clean; vite build green; raw-color guard 49/49.
