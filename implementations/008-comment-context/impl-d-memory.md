# Impl-D (web) — 008-comment-context memory

Actor pattern. Branch `008-comment-context`. No commit/push.

## Scope
Plan §1.5 (UI), §2.6 (routes), §2.8 (web). Owns the "web" row in §4.
Deliver: `api/forms.ts`, enrich `FormCommentCard` + field subcomponents,
`TicketDetail` integration, `PreviewRoute` specimen, web tests. Keep raw-color guard green.

## Files read
| File | Why |
|---|---|
| plans/008-comment-context.md | scope §1.5/§2.6/§2.8 |
| channels/008-comment-context-channel.log | A posted shared types + repo sigs |
| ui/FormCommentCard.tsx + .css.ts | enrich target |
| ui/types.ts, design/tokens.ts, ui/tone.ts | tone/enum vocab |
| ui/Pill.tsx, ui/Button.tsx | primitive props (Button variant=primary, disabled) |
| design/contract.css.ts | vars (space/color/radius/fontSize) |
| design/no-raw-colors.test.ts | invariant: no #hex/rgb/hsl in ui/*.tsx,*.css.ts,components/*.css.ts |
| api/client.ts, api/attention.ts, api/tickets.ts | request/jsonBody + mirror-type pattern; TicketComment already has metadata |
| components/TicketDetail.tsx + .css.ts + .plan.test.tsx | integrate form rendering; RTL+mock api pattern |
| preview/PreviewRoute.tsx | Specimen + Section harness, Forms section exists |
| ui/domain.test.tsx | existing FormCommentCard tests (data-blocks-ticket) |
| web vitest.config.ts + test/setup.ts | jsdom + jest-dom, include src/**/*.test.{ts,tsx} |

Baseline web suite: 10 files / 49 tests pass (raw-color guard = 49/49 ref point).

## Files written
(filled at end)

## Gist
Web stays node-free: local mirror of Form/FormQuestion/FormAnswer enums in api/forms.ts.
Tokens: amber=toneAmber (agent/open), red=risk.critical (blocks/required), indigo=Button primary.

## FINAL (verified green)
web `tsc --noEmit`: clean. web `vitest run`: **16 files / 173 tests pass**.
Raw-color guard no-raw-colors.test.ts: **50/50** (incl. both my ui/FormCommentCard.css.ts
and ui/FormCommentCard.tsx). No regressions.

### Last bug fixed (important for B/C reviewing api modules)
api/forms.ts originally used paths like `/api/tickets/:id/forms`, but the shared
`request()` ALREADY prepends API_PREFIX ("/api") → produced `/api/api/...` → 404/500 →
the `load()` forms try/catch swallowed it → form comments rendered as plain comments.
FIX: paths in api/forms.ts are now RELATIVE to the prefix (`/tickets/:id/forms`,
`/forms/:id`, `/forms/:id/submit`, `/forms/:id/dismiss`) — matching api/plans.ts &
api/attention.ts. Tests that mock the form card render must use `findBy*` (forms load
after the ticket, in a separate try, so the card appears on a later re-render).
