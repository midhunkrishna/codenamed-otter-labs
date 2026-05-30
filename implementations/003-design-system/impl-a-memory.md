# Impl-A (Foundation) — memory · plan 003-design-system (MIN-43)

Branch: `design-system`. Scope: themes, density, global reset, theme provider, @fontsource wiring + tests.

## Files

| File | R/W | Notes |
|------|-----|-------|
| `plans/003-design-system.md` | R | plan |
| `packages/web/src/design/contract.css.ts` | R | FROZEN `vars` + `space` contracts |
| `packages/web/src/design/tokens.ts` | R | FROZEN enums + semantic accessors |
| `packages/web/src/ui/types.ts` | R | FROZEN `ThemeContextValue` |
| `packages/web/vite.config.ts` | R | vanilla-extract plugin + vitest jsdom |
| `packages/web/src/design/index.ts` | R | FROZEN barrel (re-exports my theme.tsx) |
| `packages/web/src/test/setup.ts` | R | jest-dom only |
| `packages/web/src/design/themes/linear.css.ts` | W | dark, default theme (reference) |
| `packages/web/src/design/themes/notion.css.ts` | W | warm light |
| `packages/web/src/design/themes/jira.css.ts` | W | dense light, sharp 3px radius |
| `packages/web/src/design/themes/celebration.css.ts` | W | playful light, Fraunces sans, round radius |
| `packages/web/src/design/themes/index.ts` | W | `themeClasses: Record<ThemeName,string>` registry |
| `packages/web/src/design/density.css.ts` | W | `densityClasses: Record<Density,string>` (compact/regular/comfy) |
| `packages/web/src/design/global.css.ts` | W | reset + base elements + @fontsource side-effect imports |
| `packages/web/src/design/theme.tsx` | W | ThemeProvider, useTheme, useDensity, useThemeContext, rootClassName |
| `packages/web/src/design/theme.test.tsx` | W | provider behavior (8 tests) |
| `packages/web/src/design/themes.test.ts` | W | registries (5 tests) |
| `packages/web/src/design/no-raw-colors.test.ts` | W | ui/ raw-color guard (28+ tests; grows with ui files) |
| `packages/web/package.json` | W | added @fontsource inter/jetbrains-mono/fraunces (were MISSING) |

## What I implemented
- 4 themes via `createTheme(vars, {...})`, each supplying every leaf of the frozen `vars` contract (palette, owner hues+soft, 8 tones+soft, fonts, 8 text steps, 5 radii, 2 shadows). `themeClasses` registry maps ThemeName→class.
- 3 density classes via `createTheme(space, {...})` filling every `space` leaf; `densityClasses` maps Density→class. Regular = 4px-grid baseline; compact ≈0.85× (fontSize 13); comfy ≈1.15× (fontSize 15). Distinct enough for switch assertions.
- `global.css.ts`: `globalStyle` reset (box-sizing, margin/padding zero), body uses `vars.color.bg/text`, `vars.font.sans`, `space.fontSize`; code→mono; a→accent. Side-effect imports of @fontsource CSS (inter 400/500/600/700, jetbrains-mono 400/500, fraunces 400/500/600).
- `theme.tsx`: ThemeProvider holds {theme,density} state, applies `rootClassName()` = `themeClasses[theme] " " densityClasses[density]` to `document.documentElement.className` in a useEffect keyed on [theme,density]. No remount — only the html className mutates. Hooks throw outside provider.

## API exposed (for Impl-D)
- `ThemeProvider` (props `children`, `defaultTheme?='linear'`, `defaultDensity?='regular'`).
- `useTheme(): { theme, setTheme }`, `useDensity(): { density, setDensity }`, `useThemeContext(): ThemeContextValue`, `rootClassName(theme,density)`.
- `themeClasses` from `design/themes`, `densityClasses` from `design/density.css`.
- `design/global.css.ts` = side-effect import (call once at app entry).

## Tests
`cd packages/web && npx vitest run src/design` → 3 files, 47 tests passing. Covers: default+prop classes on html; setTheme no-remount (DOM node identity + mount-effect count stable); setDensity swap; theme persists across density change; full context shape; hooks throw outside provider; registry completeness/distinctness; raw-color guard over ui/.

## Gist / gotchas
- **@fontsource was NOT installed** despite the plan claiming so — `package.json` had no entry and node_modules was absent. Installed inter/jetbrains-mono/fraunces via `npm install -w @otter/web`. Orchestrator should confirm lockfile committed.
- **`@vanilla-extract/css` is hoisted to the workspace ROOT** node_modules, not `packages/web/node_modules` — resolves fine via npm workspaces.
- **Import a `.css.ts` file as `./name.css`** (e.g. `./density.css`), not `./name`. The vanilla-extract vite plugin keys off the `.css` in the specifier; `./density` fails to resolve. (Frozen files already do this with `./contract.css`.) `themes/index.ts` is a plain `.ts` so it imports as `./themes`.
- **createTheme validates every contract leaf at build/transform time** — a missing leaf is a type error and the plugin fails the transform. All 4 themes + 3 densities compile, which proves completeness.
- jsdom: `document.documentElement` is the `<html>` node; setting `.className` works and React's `act()` flushes the useEffect so assertions see the new class. Hook-throw tests emit expected React error-boundary console noise (harmless).
- Judgement call (Celebration): set `font.sans = Fraunces` (kept mono = JetBrains) so chrome/body read expressively-serif — the visible "playful" signal. Documented in the file header.
- Judgement call (light themes): derived non-anchored palette values (surfaces, dark-on-light borders, muted-brown/slate text, onAccent #fff) and nudged tone hues to read on light bg while preserving semantics; raised `*Soft` alphas slightly. Less refined than Linear but complete + selectable, per invariant 2.
