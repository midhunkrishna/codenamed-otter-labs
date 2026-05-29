import { mkdirSync } from "node:fs";
import { layoutDirectories, type OtterPaths } from "@otter/shared";

/**
 * Create every directory in the resolved layout (`mkdir -p` semantics).
 *
 * Idempotent: uses `recursive: true`, so re-running is a no-op. Never deletes
 * anything — it only creates missing directories. Directories are created in
 * the order returned by {@link layoutDirectories} (parents before children).
 */
export function ensureLayout(paths: OtterPaths): void {
  for (const dir of layoutDirectories(paths)) {
    mkdirSync(dir, { recursive: true });
  }
}
