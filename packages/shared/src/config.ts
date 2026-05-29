import { DEFAULT_PORT, ENV_DATA_DIR, ENV_PORT } from "./constants.js";
import { resolveDataDir } from "./paths.js";
import type { OtterConfig } from "./types.js";

/**
 * Load runtime configuration (MIN-11).
 *
 * @param env  environment bag (defaults to `process.env`)
 * @param root project root (defaults to `process.cwd()`)
 *
 * Port resolution: `OTTER_PORT` env → {@link DEFAULT_PORT} (4873).
 * Data dir: `OTTER_DATA_DIR` env (relative or absolute) → `<root>/.otter-labs`.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  root: string = process.cwd(),
): OtterConfig {
  const rawPort = env[ENV_PORT];
  let port = DEFAULT_PORT;
  if (rawPort !== undefined && rawPort !== "") {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error(`Invalid ${ENV_PORT}: ${rawPort} (expected 1-65535)`);
    }
    port = parsed;
  }
  return {
    port,
    projectRoot: root,
    dataDir: resolveDataDir(root, env[ENV_DATA_DIR]),
  };
}
