#!/usr/bin/env -S node --import tsx
import { loadConfig, resolvePaths } from "@otter/shared";
import type { OtterConfig, OtterPaths } from "@otter/shared";
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

async function defaultInit(paths: OtterPaths) {
  // Lazy import so unit tests don't hard-depend on @otter/persistence being built.
  const { initPersistence } = await import("@otter/persistence");
  return initPersistence(paths);
}

export interface StartAppDeps {
  init?: InitPersistence;
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
  { init = defaultInit }: StartAppDeps = {},
): Promise<RunningApp> {
  await init(paths);
  const app = await createServer(config, paths);
  await app.listen({ port: config.port, host: "127.0.0.1" });
  return {
    url: `http://localhost:${config.port}`,
    port: config.port,
    paths,
    close: () => app.close(),
  };
}

/** CLI entrypoint: load config, resolve paths, start the server, log startup info. */
export async function main(): Promise<RunningApp> {
  const root = invocationRoot();
  const config = loadConfig(process.env, root);
  const paths = resolvePaths(config.projectRoot, process.env.OTTER_DATA_DIR);
  const app = await startApp(config, paths);
  console.log(`Otter Labs backend started`);
  console.log(`  project root: ${paths.root}`);
  console.log(`  data dir:     ${paths.dataDir}`);
  console.log(`  local URL:    ${app.url}`);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
