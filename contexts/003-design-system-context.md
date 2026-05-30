# Design System — Orchestrator Context

Rollup of sub-agent progress for plan `003-design-system.md` (MIN-43).
Updated by the Orchestrator. Builds on `001-foundations` + `002-ticket-core`.

## Status — COMPLETE ✅
- [x] Phase 1: branch `design-system`, deps (vanilla-extract + @fontsource), vite plugin wired, **seam frozen**, plan + context + channel scaffolded
- [x] Phase 2: MIN-43 → In Progress
- [x] Phase 3 Wave 1: Impl-A (foundation) · Impl-B (core primitives) · Impl-C (domain primitives) — parallel
- [x] Phase 3 Wave 2: Impl-D (integration + preview + migration)
- [x] Phase 4: verification — **108/108 tests**, tsc clean, `vite build` clean, fonts bundled, raw-color invariant holds; orchestrator tie-ups applied

## Decisions (deliberate discovery, resolved with user)
1. **vanilla-extract** (typed CSS-in-TS). 2. **@fontsource** self-hosted fonts. 3. **In-app "Components" preview route** (no Storybook). 4. **Full adoption** — existing Board/Detail migrated onto primitives.

## Frozen contracts (orchestrator-owned)
- `design/contract.css.ts` — `vars` (palette/owner hues/8 tones+soft/type/radius/shadow) + `space` (density) vanilla-extract contracts.
- `design/tokens.ts` — semantic layer (`ownerTone`/`statusTone`/`riskTone`/`attentionTone`), enums, labels.
- `ui/types.ts` — prop API for all 20 primitives + `ThemeContextValue`. (Orchestrator added a re-export of the design domain types here during verification so consumers import them from one place.)
- `vite.config.ts` — `vanillaExtractPlugin()` before `react()`.
- Barrels `design/index.ts`, `ui/index.ts` — locked filenames/export names.

## Implementor summaries
**A · Foundation** — `design/themes/{linear,notion,jira,celebration}.css.ts` (+ `index.ts` `themeClasses`), `density.css.ts` (`densityClasses`, compact/regular/comfy), `global.css.ts` (reset/base), `theme.tsx` (`ThemeProvider`/`useTheme`/`useDensity`/`useThemeContext`/`rootClassName`). Provider writes `themeClass+densityClass` to `<html>` in a `useEffect` — **no remount on switch** (asserted via stable child node + mount-count). 47 design tests. Celebration uses Fraunces as the display/sans for a playful serif feel; light themes complete but less refined than Linear (per invariant 2).

**B · Core primitives (13)** — Card (owner stripe + status tone + amber block stripe), Pill, Badge, Button, AppShell, Sidebar, PageHeader, SectionHeader, Drawer, Tabs, EmptyState, CodeBlock, MetadataRow + internal `ui/tone.ts` (`resolveTone` selector parser + `inlineVars`). 25 tests. Dynamic per-instance tones via `createVar()` + `inlineVars()` (unwraps `var(--x)`→bare `--x` for React style key; `@vanilla-extract/dynamic` not installed).

**C · Domain primitives (7)** — TicketCard (owner stripe + phase chip + agent pulse/progress + block stripe), AttentionCard + ExpandedAttentionCard, ApprovalCard (risk pill + verbatim command + facts), PlanCard (state pill), FormCommentCard (red "Blocks ticket" when open), VerificationPacketTabs (Walkthrough/Verify/Facts/Why). 15 tests. Reused B's Pill/Button/CodeBlock/MetadataRow (real imports); built the four interaction-heavy cards bespoke on contract vars. Agent pulse = the single 1.6s continuous animation, disabled under `prefers-reduced-motion`.

**D · Integration & preview** — `main.tsx` (ThemeProvider + entry CSS), `App.tsx` (AppShell+Sidebar, 7 nav incl. Attention + Components, theme+density pickers in `app/ThemeControls.tsx`), migrated `Board`/`CreateTicketForm`/`TicketDetail` onto primitives (behavior preserved: transitions only from `GET /transitions.next`, comments oldest-first, refetch after mutations, PATCH never sets status), deleted old `components/TicketCard.tsx`, added `ownerForTicket()` in `status.ts`, built `preview/PreviewRoute.tsx` (all 20 primitives × 4 themes × 3 densities). 108 total tests; `tsc` clean; `vite build` clean.

### Owner derivation (Ticket has no owner field — D's mapping, in `components/status.ts`)
blocked→`blocked`; created/plannable/needs_user_approval/needs_user_review→`user`; executable/in_progress→`agent`; done/canceled/failed→`system`.

## Channel verification (acks confirmed by code evidence)
- **B↔C**: C flagged B's `var(--x)`-as-style-key bug ("Unsupported style property"); B fixed it via `inlineVars()` and posted "Card/Pill/Badge/Button READY"; C ACKed with real integration. Evidence: `ui/domain.test.tsx` (15/15) renders against B's real component files; `ui/core.test.tsx` 25/25 green post-fix.
- **A→D**: A posted final provider/registry API + the `design/density.css` `.css`-suffix import gotcha; D consumed it verbatim (`main.tsx` imports `./design/global.css`, wraps `<ThemeProvider>`). Evidence: `App.test.tsx` asserts root theme class + switch.

## Orchestrator verification & tie-ups (Phase 4)
- Independently ran: `vitest` 108/108, `tsc --noEmit` exit 0, `vite build` clean. All 4 theme accents present in compiled CSS.
- **Tie-up 1 (seam):** `Priority` etc. weren't re-exported from `ui/types.ts` → strict-typecheck (`noUncheckedIndexedAccess`) failed in AttentionCard. Added a domain-type re-export to the seam.
- **Tie-up 2:** `ui/tone.ts` regex-match index access made null-safe (`m?.[1] ?? ref`).
- **Tie-up 3 (fonts, important):** @fontsource imports were inside `global.css.ts` (a vanilla-extract `.css.ts`), which DROPS plain CSS side-effect imports → build had **0 @font-face / 0 woff2** (silent system-font fallback). Moved them to a plain module `design/fonts.ts`, imported from `main.tsx`. Rebuild now bundles **45 woff2 + 49 @font-face** (Inter/JetBrains Mono/Fraunces) — self-hosted, no cloud (invariant 6).

## Loose ends / follow-ups (non-blocking)
- Attention/Runs/Approvals/Docs/Settings nav render `<EmptyState>` placeholders — the real pages are separate tickets (MIN-37/38/31/32/33/34/39–42) that will consume these primitives.
- The old `components/TicketCard.tsx` was deleted; `components/status.ts` is now web-local owner+label source (still independent of `@otter/shared`, per the node-free browser-bundle convention).
- MIN-43 left **In Progress** (not auto-moved to Done/In Review — awaiting user review/commit). No commit made (user has not requested one).
- `.design-source/` (decoded design HTML) and `dist/` are gitignored.
