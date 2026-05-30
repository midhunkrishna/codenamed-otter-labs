import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resolvePaths } from "@otter/shared";
import type { OtterConfig, OtterPaths } from "@otter/shared";
import { initPersistence } from "@otter/persistence";
import { createServer } from "./server.js";

/**
 * Directory the CLI was invoked from — where `.otter-labs` is created.
 *
 * `npx`/`npm` set `INIT_CWD` to the user's invocation directory even when the
 * underlying script runs with a different cwd (e.g. `npm -w <pkg> run start`
 * runs inside the package dir). For a directly-executed binary, `INIT_CWD` is
 * absent and we fall back to `process.cwd()`. Either way this resolves to the
 * directory the user ran `otter-labs` from.
 */
export function invocationRoot(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  return env.INIT_CWD ?? cwd;
}

/** Dependency seam: persistence ensures the data-dir layout + opens SQLite (MIN-12). */
export type InitPersistence = (
  paths: OtterPaths,
) => Promise<{ db: unknown; applied: string[] }> | { db: unknown; applied: string[] };

function defaultInit(paths: OtterPaths) {
  return initPersistence(paths);
}

export interface StartAppDeps {
  init?: InitPersistence;
  /** Absolute path to the built web UI to serve same-origin. Omitted in dev. */
  webRoot?: string;
}

export interface RunningApp {
  url: string;
  port: number;
  paths: OtterPaths;
  close: () => Promise<void>;
}

/**
 * Start the local backend: ensure the data dir exists (via injected `init`),
 * start Fastify, and return a handle. Idempotent — safe to start repeatedly
 * because `init` is mkdir -p and reuses an existing `.otter-labs`.
 */
export async function startApp(
  config: OtterConfig,
  paths: OtterPaths,
  { init = defaultInit, webRoot }: StartAppDeps = {},
): Promise<RunningApp> {
  const { db } = await init(paths);
  // `init` is a permissive DI seam (db: unknown) so unit tests can inject a stub.
  // The real `defaultInit` yields the better-sqlite3 handle the routes expect.
  const app = await createServer(config, paths, db as Parameters<typeof createServer>[2], {
    webRoot,
  });
  await app.listen({ port: config.port, host: "127.0.0.1" });
  return {
    url: `http://localhost:${config.port}`,
    port: config.port,
    paths,
    close: () => app.close(),
  };
}

/**
 * Resolve the built web UI directory, if present. Two layouts:
 *  - packaged bundle: `<dir>/web` sits next to `cli.js` (this module after bundling).
 *  - dev from source: `packages/web/dist` (two levels up from `packages/core/src`).
 * Returns undefined when no build exists (dev without a web build → Vite serves it).
 */
export function resolveWebRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "web"), join(here, "..", "..", "web", "dist")];
  return candidates.find((p) => existsSync(p));
}

/** CLI entrypoint: load config, resolve paths, start the server, log startup info. */
export async function main(): Promise<RunningApp> {
  const root = invocationRoot();
  const config = loadConfig(process.env, root);
  const paths = resolvePaths(config.projectRoot, process.env.OTTER_DATA_DIR);
  const webRoot = resolveWebRoot();
  const app = await startApp(config, paths, { webRoot });
  console.log(`Otter Labs started`);
  console.log(`  project root: ${paths.root}`);
  console.log(`  data dir:     ${paths.dataDir}`);
  console.log(`  local URL:    ${app.url}${webRoot ? "  (UI + API)" : "  (API only)"}`);
  return app;
}
