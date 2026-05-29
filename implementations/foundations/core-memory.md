# Implementor A "core" — MIN-11 memory

## Files read & written

| Action | File |
| --- | --- |
| read | packages/shared/src/{config,constants,paths,types,index}.ts |
| read | packages/core/{package.json,tsconfig.json} |
| read | tsconfig.base.json, root package.json |
| read | channels/foundations-channel.log |
| read | packages/persistence/src/index.ts (signature only) |
| write | packages/core/src/server.ts |
| write | packages/core/src/cli.ts |
| write | packages/core/src/index.ts |
| write | packages/core/src/server.test.ts |
| write | packages/core/src/integration.test.ts |
| write | channels/foundations-channel.log (appended) |
| write | implementations/foundations/core-memory.md |

## Summary
Local Node/TS backend shell for `@otter/core`.
- `createServer(config, paths)`: async, returns configured Fastify instance. Registers `@fastify/websocket`. `GET /api/health` -> 200 `HealthResponse` (uptimeMs from captured start time). `/ws` route sends `{type:"hello"}` on connect, echoes messages.
- `startApp(config, paths, { init = defaultInit })`: DI seam — calls `init(paths)` (persistence creates `.otter-labs`), starts Fastify on `config.port` (host 127.0.0.1), returns `{ url, port, paths, close }`. Idempotent (init is mkdir -p + reuse).
- `main()`: loadConfig() -> resolvePaths(projectRoot, OTTER_DATA_DIR) -> startApp; logs project root, data dir, local URL. Self-invokes when run as script.
- `defaultInit` lazy-imports `@otter/persistence.initPersistence` so unit tests don't hard-depend on B.

## Tests
- server.test.ts: health 200 + shape; port config respected + init called once (fake init).
- integration.test.ts: REAL initPersistence against temp OTTER_DATA_DIR — proves `.otter-labs` + `otter.db` created, re-running safe. Auto-skips if persistence absent.
- `npx vitest run packages/core` => Test Files 2 passed, Tests 3 passed.
- Smoke: CLI boots, curl /api/health OK, full layout + otter.db created.

## Gist
- Shared `loadConfig` rejects port 0/invalid — integration test uses a real port (4899), not 0.
- B's `initPersistence(paths): InitResult { db, applied }` is SYNC. My `InitPersistence` type accepts sync or async, so it wires cleanly.
- No root tsconfig.json exists; typecheck per-package: `tsc -p packages/core/tsconfig.json`.
- B's code landed during my work; integration test runs green against it.
