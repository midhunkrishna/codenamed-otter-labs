# Plan 003 — Multi-theme Otter Design System (MIN-43)

Theme: **design-system** · Ticket: **MIN-43** (High) · Branch: `design-system`
Builds on completed foundations (`001`) + ticket-core (`002`). Pattern: **actor.agent**.

## 1. Goal

Implement the uploaded Otter design language as the MVP styling foundation, with
**full multi-theme architecture from day one**. Styling carries product meaning:
ownership, lifecycle status, risk, attention type, permission, and verification
state must be visually legible across the whole app. This is the foundation the
downstream UI themes consume — Board (MIN-16, done), Attention (MIN-37/38),
Approvals (MIN-31), Forms (MIN-27), Verification (MIN-39–42) — so they don't each
invent one-off styling.

## 2. Deliberate discovery — decisions (resolved with user)

| # | Question | Decision |
|---|----------|----------|
| 1 | Token/styling tech | **vanilla-extract** (typed CSS-in-TS); tokens as theme contracts compiled to static CSS. |
| 2 | Font loading (no extracted files, no cloud) | **@fontsource/** npm packages (Inter, JetBrains Mono, Fraunces), self-hosted/bundled. |
| 3 | Preview surface | **In-app "Components" route** (no Storybook). |
| 4 | Adoption depth | **Full**: build tokens+primitives+shell+preview AND migrate existing Board/TicketCard/CreateTicketForm/TicketDetail to consume primitives (behavior unchanged). |

Open items checked against `contexts/deferred.md`: empty — nothing to fold in.

## 3. Architecture

Design system lives **inside `@otter/web`** (respecting the established convention
that the browser bundle is self-contained and node-free — web keeps its own
mirrors and does not import `@otter/shared`). Layout:

```
packages/web/src/
  design/
    contract.css.ts     [FROZEN] vars (palette/chrome/type/shape) + space (density) contracts
    tokens.ts           [FROZEN] semantic layer: owner/status/risk/attention tones, enums, labels
    themes/             createTheme() per theme → class names
      linear.css.ts (default) · notion.css.ts · jira.css.ts · celebration.css.ts · index.ts (registry)
    density.css.ts      createTheme(space, …) → compact/regular/comfy class names
    global.css.ts       reset + base element styles + @fontsource imports
    theme.tsx           ThemeProvider, useTheme/useDensity (applies classes to <html>, no remount)
  ui/
    types.ts            [FROZEN] prop API for all primitives
    <Primitive>.tsx + <Primitive>.css.ts  (one pair per primitive)
    index.ts            barrel
  preview/
    PreviewRoute.tsx    every primitive × 4 themes × 3 densities
```

**Token model.** `contract.css.ts` (frozen) defines two vanilla-extract contracts:
- `vars` — palette (bg/surface/card/border/text/accent), 4 owner hues (+soft), 8
  status/risk tones (+soft), typography, radius, shadow.
- `space` — 4px-grid spacing + semantic spacing + control sizing + base font-size.

`tokens.ts` (frozen) maps **semantic names → contract vars** (`statusTone`,
`riskTone`, `attentionTone`, `ownerTone`). Mapping is theme-independent; only the
tone's concrete value changes per theme. Components consume the semantic
accessors / contract vars — **never raw colors**.

**Theme & density switching.** `<html>` carries `themeClass densityClass`.
Switching either swaps a class → CSS vars recascade with **no React remount**.
Linear is the default theme; regular is the default density.

## 4. Required deliverables (from MIN-43)

- 4 themes: **Linear** (dark, default), **Notion** (warm), **Jira** (dense), **Celebration** (playful/serif).
- 3 densities: compact / regular / comfy.
- Semantic tokens: owner.{user,agent,system,blocked}; status.{9 lifecycle}; risk.{low,medium,high,critical}; attention.{permission,plan,question,verification,failure}.
- Primitives: AppShell, Sidebar, PageHeader, SectionHeader, Card, TicketCard, AttentionCard, ExpandedAttentionCard, ApprovalCard, PlanCard, FormCommentCard, VerificationPacketTabs, Pill, Badge, Button, Drawer, Tabs, EmptyState, CodeBlock, MetadataRow.
- Ownership stripe primitive (warm/cool/amber/neutral) on cards.
- Component preview page across all themes.

## 5. Invariants (acceptance gate)

1. Components must **not** hardcode theme-specific colors — only contract vars / semantic accessors (raw colors only inside `themes/*.css.ts`).
2. Multi-theme from day one; Linear default; non-default themes may be less refined but must be selectable programmatically.
3. Density is root-level, not per-component.
4. Ownership, lifecycle status, risk, attention type must be visually distinct.
5. Board is not the only styled surface — Attention/Approvals/Forms/Runs/Verification reuse the same primitives (proven via the preview route + migrated Board/Detail).
6. No cloud dependency (fonts self-hosted via @fontsource).
7. Existing app behavior unchanged after migration (board still lists by column, detail still drives transitions from backend, comments oldest-first).

## 6. Testing directives (must all hold)

- Primitives render (DOM/snapshot).
- Theme switch changes the root CSS-var class **without remounting** the app.
- Density switch changes spacing vars.
- TicketCard renders owner stripe + status tone.
- AttentionCard renders type + priority tone.
- ApprovalCard renders risk tone.
- VerificationPacketTabs render the 4 lenses with theme tokens.
- A guard test asserts no primitive `.tsx`/`.css.ts` contains raw hex/oklch literals (only theme files may).

## 7. Parallel split — Implementor team (actor pattern)

Orchestrator froze the seam first: `vite.config.ts` (+ vanilla-extract plugin),
`design/contract.css.ts`, `design/tokens.ts`, `ui/types.ts`. All tracks build
against these.

**Wave 1 (parallel):**
- **Impl-A · Foundation** — owns `design/themes/*`, `density.css.ts`, `global.css.ts`,
  `theme.tsx`, @fontsource wiring. Implements 4 themes + 3 densities + provider/hooks
  + global reset. Tests: theme/density switch (no remount), tone resolution, raw-color guard.
- **Impl-B · Core primitives** — owns `ui/` generic + layout set: AppShell, Sidebar,
  PageHeader, SectionHeader, Card (owner stripe + tone + block stripe), Pill, Badge,
  Button, Drawer, Tabs, EmptyState, CodeBlock, MetadataRow (+ `.css.ts` each). Tests render + tone/owner.
- **Impl-C · Domain primitives** — owns `ui/` product set: TicketCard, AttentionCard,
  ExpandedAttentionCard, ApprovalCard, PlanCard, FormCommentCard, VerificationPacketTabs.
  Consumes Impl-B's Card/Pill/Badge/Button — coordinates the exact API on the channel and
  polls for B's "Card ready" signal; builds against frozen `ui/types.ts` meanwhile.

**Wave 2:**
- **Impl-D · Integration & preview** — adopts AppShell/Sidebar in `App.tsx` (+ theme/density
  picker), migrates existing Board/TicketCard/CreateTicketForm/TicketDetail to consume
  primitives (behavior identical, tests stay green), builds the `/preview` Components route
  (all primitives × themes × densities). Runs after Wave 1.

**Phase 4 — Orchestrator verification:** read each `implementations/003-design-system/*.md`,
read the channel + confirm acks have code evidence, run full `vitest` + typecheck + `vite build`,
boot the app and eyeball theme/density switching, then update the context file.

## 8. Channel & memory

- Channel: `channels/003-design-system-channel.log` (from:/to:/message:, >> appends, <4KB).
- Each Implementor writes `implementations/003-design-system/<impl>-memory.md` (files table, summary, gist).
- Orchestrator keeps `contexts/003-design-system-context.md`.

## 9. Out of scope / deferred

- Building the actual Attention/Approvals/Forms/Verification *pages* (separate tickets MIN-37/38/31/27/39–42) — this plan delivers the **primitives** they will consume.
- Plan-approval guard wiring (tracked from plan 002) — unrelated.
