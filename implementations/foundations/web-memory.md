# web-memory — Implementor C (web, MIN-13)

## Files read & written

| File | R/W | Notes |
|------|-----|-------|
| `packages/web/package.json` | R | name `@otter/web`; scripts dev/build/preview/test; deps react/react-dom |
| `packages/web/vite.config.ts` | R | FROZEN. port 5873, proxies `/api` + `/ws` -> `http://localhost:4873`; vitest jsdom+globals, setup `./src/test/setup.ts` |
| `packages/web/tsconfig.json` | R | jsx react-jsx; types vite/client, vitest/globals, jest-dom |
| `packages/shared/src/constants.ts` | R | confirmed API_PREFIX="/api", WS_PREFIX="/ws" (mirrored locally, NOT imported) |
| `packages/shared/src/types.ts` | R | HealthResponse `{status:"ok"; uptimeMs:number; dataDir:string}` (mirrored locally) |
| `plans/001-foundations.md` | R | scope/AC/invariants |
| `channels/foundations-channel.log` | R/W | posted health-shape handshake; core confirmed; posted DONE |
| `packages/web/index.html` | W | Vite entry, `<div id="root">`, script `/src/main.tsx` |
| `packages/web/src/main.tsx` | W | createRoot -> `<App/>` in StrictMode |
| `packages/web/src/App.tsx` | W | app shell: header+nav+content; `NAV_ITEMS` typed list; useState view switching (no react-router) |
| `packages/web/src/api/client.ts` | W | `API_PREFIX="/api"`, `HealthResponse`, `request()`, `getHealth()` |
| `packages/web/src/ws/client.ts` | W | `WS_PREFIX="/ws"`, `wsUrl()`, `connect()` stub (open/onMessage/close) |
| `packages/web/src/components/HealthBadge.tsx` | W | calls getHealth(), shows status |
| `packages/web/src/test/setup.ts` | W | `import "@testing-library/jest-dom";` |
| `packages/web/src/App.test.tsx` | W | shell renders + 5 nav links (fetch mocked) |
| `packages/web/src/components/HealthBadge.test.tsx` | W | health API callable from UI (fetch mocked, asserts "backend: ok") |

## Summary
Built the initial React web shell for `@otter/web` (MIN-13). App shell has a header
(title + HealthBadge), a primary nav (Board/Runs/Approvals/Docs/Settings via typed
`NAV_ITEMS`), and a content area switched with `useState` (react-router not installed).
REST client (`src/api/client.ts`) uses local mirror constant `API_PREFIX="/api"` and
same-origin relative URLs (Vite proxy handles routing to backend :4873); `getHealth()`
hits `/api/health` and returns a locally-mirrored `HealthResponse`. WebSocket client
(`src/ws/client.ts`) is a real-shaped stub: `WS_PREFIX="/ws"`, `wsUrl()` builds
`ws(s)://${location.host}/ws`, `connect()` returns `{socket,onMessage,close}`.
Web does NOT import `@otter/shared` (browser bundle stays node-free). Contract handshake
posted to core and confirmed (health shape + `/api`/`/ws` prefixes unchanged; WS at `/ws`).

Verification: `npx vitest run packages/web` => 2 files / 3 tests pass. `tsc -p packages/web/tsconfig.json`
clean. `npm -w @otter/web run build` (tsc+vite) green. Dev server confirmed on
**http://localhost:5873** (serves root div, HTTP 200) and proxies `/api`+`/ws` to backend `:4873`.

## Gist
- UI reachable at `http://localhost:5873`; root `npm run dev` runs core+web concurrently.
- Keep API under `/api`, WS under `/ws` (invariant). Use same-origin relative URLs only.
- HealthResponse + prefixes are mirrored locally on purpose — re-sync via channel if the core contract changes.
- act() warnings were removed by awaiting HealthBadge settle in App tests; tests are deterministic (fetch mocked, no real network).
