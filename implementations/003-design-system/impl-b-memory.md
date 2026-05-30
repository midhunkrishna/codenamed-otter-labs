# Impl-B — Core / layout primitives (plan 003-design-system, MIN-43)

## Summary
Built the 13 generic/layout primitives in `packages/web/src/ui/`, each as a
`<Name>.tsx` + sibling `<Name>.css.ts` (vanilla-extract). All styling references
ONLY contract vars (`design/contract.css` `vars`/`space`) and the semantic
accessors (`design/tokens` `ownerTone`/`statusTone`/`riskTone`/`attentionTone`)
— zero raw color literals. Tests: `src/ui/core.test.tsx`, 25/25 green. Impl-C's
`domain.test.tsx` (15/15) consumes these real files. Combined `vitest run src/ui`
= 40/40 green.

## Files

| File | Purpose |
|------|---------|
| `ui/tone.ts` | Internal helper (NOT in barrel). `resolveTone(selector)` parses a `ToneSelector` → `{fg,soft}` contract-var refs. `inlineVars(map)` unwraps `createVar()` `var(--x)` refs → bare `--x` React style keys (assignInlineVars equivalent; `@vanilla-extract/dynamic` not installed). |
| `ui/Card.tsx` + `.css.ts` | The atom. owner stripe (left `::before`, amber when `blockReason` set), status `tone` border tint, `blockReason` top amber banner, `interactive`/`onClick` (role=button, tabIndex 0, hover lift). |
| `ui/Pill.tsx` + `.css.ts` | `<span>` tone chip; `tone:ToneSelector`. soft=bg, fg=text via per-instance css vars. |
| `ui/Badge.tsx` + `.css.ts` | Tone chip; numeric `count` variant (overrides children, pill shape). |
| `ui/Button.tsx` + `.css.ts` | `<button>`; variants primary/default/danger/ghost via `styleVariants`. primary=accent+onAccent, danger=toneRed, sizing from `space.controlHeight`/`controlPadX`. |
| `ui/AppShell.tsx` + `.css.ts` | CSS grid: sidebar col + main (optional topbar over scroll content). |
| `ui/Sidebar.tsx` + `.css.ts` | brand, titled sections, items w/ optional `badge`+`badgeTone` (renders `Badge count`), `activeId`/`onNavigate` (aria-current), `collapsed` 56px rail, bottom `footer`. |
| `ui/PageHeader.tsx` + `.css.ts` | eyebrow/title(h1)/description + right-aligned actions. |
| `ui/SectionHeader.tsx` + `.css.ts` | title(h2) + uppercase `tag` + actions. |
| `ui/Tabs.tsx` + `.css.ts` | role=tablist/tab, aria-selected, `activeId`/`onSelect`. |
| `ui/Drawer.tsx` + `.css.ts` | open/onClose, mode side(520px right)/full(inset). Renders null when closed. Scrim = `vars.color.bg` @ opacity 0.6 (NO raw rgba). Close button aria-label="Close". |
| `ui/EmptyState.tsx` + `.css.ts` | centered icon/title/description/action. |
| `ui/CodeBlock.tsx` + `.css.ts` | mono `code` verbatim; `<pre><code>` block or `inline` `<code>`. |
| `ui/MetadataRow.tsx` + `.css.ts` | `<dl>` facts grid, `columns` 1\|2 via `styleVariants`. |
| `ui/core.test.tsx` | 25 tests covering all 13 primitives (render + owner stripe + status tone + block stripe + tone selector resolution + button variants + tabs switch + drawer open/close + nav active). |

## Gist — how dynamic per-instance tone is handled
`ToneSelector` (`"risk.medium"`, `"status.done"`, `"owner.agent"`,
`"attention.permission"`, `"neutral"`, `"accent"`) is parsed in `resolveTone`
by splitting on the first `.`: prefix selects the accessor Record
(status/risk/attention/owner), the remainder keys it; bare `neutral`→
`{textMuted, surface2}`, `accent`→`{accent, accentSoft}`. The resolved
`{fg,soft}` are contract-var references (e.g. `var(--color-toneAmber__hash)`).

Because a tone is chosen at runtime, the concrete value is applied via CSS
custom properties declared with `createVar()` in each `.css.ts`
(`toneFg`/`toneSoft`, Card also `stripeColor`). `createVar()` returns the
*consumption* form `var(--name)`; to *set* the property through React's `style`
prop the key must be the bare `--name`, so `inlineVars()` strips the `var()`
wrapper. (Originally set the raw `var(--x)` key — Impl-C caught the resulting
"Unsupported style property" warning + 5 failing assertions; fix = `inlineVars`.)

## Gotchas
- `@vanilla-extract/dynamic` is NOT installed in this workspace → wrote
  `inlineVars()` instead of importing `assignInlineVars`.
- Raw-color invariant: Drawer scrim cannot use `rgba(...)`; used `vars.color.bg`
  on a separate absolute scrim element at `opacity:0.6` (panel gets `position:
  relative; z-index:1` to sit above it).
- Tests assert on classes / data-attrs / inline css-var presence (NOT computed
  colors) since contract vars resolve to empty in jsdom (no ThemeProvider).
- Did NOT edit the frozen seam, barrels, themes, App.tsx, or existing components.
