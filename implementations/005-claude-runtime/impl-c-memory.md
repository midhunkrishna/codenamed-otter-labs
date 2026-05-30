# Impl-C memory — D-003-3 (web tone cleanup)

Theme `claude-runtime` (plan 005), branch `claude-runtime`. Independent web-only
work-stream. No commit / no push / working-tree only.

## 1. Files read & written

| File | Read | Written | Why |
|---|---|---|---|
| `plans/005-claude-runtime.md` (§3f) | ✓ | — | frozen scope |
| `contexts/deferred.md` (D-003-3) | ✓ | — | task definition |
| `packages/web/src/ui/tone.ts` | ✓ | ✓ | swap `inlineVars` body → `assignInlineVars`; delete `unwrapVar` |
| `packages/web/src/ui/Card.tsx` | ✓ | — | call site (untouched — still calls `inlineVars`) |
| `packages/web/src/ui/Pill.tsx` | ✓ | — | call site (untouched) |
| `packages/web/src/ui/Badge.tsx` | ✓ | — | call site (untouched) |
| `packages/web/package.json` | ✓ | ✓ (via `npm install`) | add `@vanilla-extract/dynamic` dep |
| `implementations/005-claude-runtime/impl-c-memory.md` | — | ✓ | this file |

## 2. What I implemented

1. Added `@vanilla-extract/dynamic` `^2.1.5` to `packages/web` `dependencies`
   (installed `-w @otter/web` from repo root; npm workspaces). Resolves to
   `node_modules/@vanilla-extract/dynamic@2.1.5`, exports `assignInlineVars`.
2. `ui/tone.ts`: `inlineVars(entries)` is now a thin wrapper that returns
   `assignInlineVars(entries)`. Deleted the hand-rolled loop AND the now-unused
   `unwrapVar()` regex shim. Kept the exported `inlineVars` name so `Card.tsx`,
   `Pill.tsx`, `Badge.tsx` are untouched. `resolveTone`, `NEUTRAL`, `ACCENT`
   unchanged. Pure refactor — no behavior/visual change, no raw colors.

## 3. Gist / API surprises

- **Version line surprise:** the frozen scope said "match the `@vanilla-extract`
  major (4.x)". That 4.x is the **vite-plugin** line. `@vanilla-extract/dynamic`
  is independently versioned — its current release is **2.1.5** (there is no 4.x;
  `@^4` errors `ETARGET`). dynamic 2.1.5 depends only on
  `@vanilla-extract/private ^1.0.9` and pairs with the installed
  `@vanilla-extract/css@1.20.1` (which vite-plugin@4.0.20 pulls in). So 2.1.5 is
  the correct, ecosystem-aligned choice.
- **API match:** `assignInlineVars(entries)` single-arg overload accepts exactly
  the `{ [createVarRef]: value }` map the call sites already pass and returns the
  inline-style object (`{ '--name': value }`). Drop-in for the old shim — the old
  `unwrapVar` regex was doing the same `var(--x) → --x` unwrap by hand. No call-site
  or type changes needed.

## 4. Verification (commands + results)

- `npx tsc -p packages/web/tsconfig.json --noEmit` → exit 0 (clean).
- `npx vitest run packages/web` → 10 files / **131 tests passed**. (Pre-existing
  unrelated `act(...)` warning in RunsConsole.test — not from this change.)
- `npm run build -w @otter/web` (tsc + vite, includes vanilla-extract plugin) →
  built OK; `dist/assets/index-*.css` + `index-*.js` emitted — dynamic vars compile.
- `npm ls @vanilla-extract/dynamic -w @otter/web` → `@vanilla-extract/dynamic@2.1.5`.
