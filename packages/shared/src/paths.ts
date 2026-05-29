import { isAbsolute, join, resolve } from "node:path";
import { DATA_DIR_NAME, DB_FILE_NAME } from "./constants.js";
import type { OtterPaths } from "./types.js";

/**
 * Resolve the absolute `.otter-labs` data directory.
 *
 * - With no override, the data dir is `<root>/.otter-labs`.
 * - An absolute override is used verbatim.
 * - A relative override is resolved against `root`.
 *
 * Both relative and absolute inputs are supported (MIN-12 test directive).
 */
export function resolveDataDir(root: string, override?: string): string {
  const absRoot = resolve(root);
  if (!override) return join(absRoot, DATA_DIR_NAME);
  return isAbsolute(override) ? resolve(override) : resolve(absRoot, override);
}

/**
 * Build the full {@link OtterPaths} layout from a project root and optional
 * data-dir override. Pure: computes paths only — does not touch the filesystem.
 * Use `ensureLayout` (in @otter/persistence) to create the directories.
 */
export function resolvePaths(root: string, dataDirOverride?: string): OtterPaths {
  const absRoot = resolve(root);
  const dataDir = resolveDataDir(absRoot, dataDirOverride);
  const artifacts = join(dataDir, "artifacts");
  return {
    root: absRoot,
    dataDir,
    dbFile: join(dataDir, DB_FILE_NAME),
    logs: join(dataDir, "logs"),
    artifacts,
    plans: join(artifacts, "plans"),
    executionReports: join(artifacts, "execution-reports"),
    diffs: join(artifacts, "diffs"),
    sessionMeta: join(dataDir, "session-meta"),
  };
}

/** Ordered list of every directory in the layout (parents before children). */
export function layoutDirectories(paths: OtterPaths): string[] {
  return [
    paths.dataDir,
    paths.logs,
    paths.artifacts,
    paths.plans,
    paths.executionReports,
    paths.diffs,
    paths.sessionMeta,
  ];
}
