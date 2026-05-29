/** Resolved data-directory layout. All paths are absolute and resolve under `dataDir`. */
export interface OtterPaths {
  /** Project root the data dir is anchored to. */
  root: string;
  /** Absolute path to the `.otter-labs` data directory. */
  dataDir: string;
  /** Absolute path to `.otter-labs/otter.db`. */
  dbFile: string;
  /** `.otter-labs/logs` — process logs. */
  logs: string;
  /** `.otter-labs/artifacts` — derived/human-readable companion files. */
  artifacts: string;
  /** `.otter-labs/artifacts/plans` — rendered markdown plan copies. */
  plans: string;
  /** `.otter-labs/artifacts/execution-reports`. */
  executionReports: string;
  /** `.otter-labs/artifacts/diffs`. */
  diffs: string;
  /** `.otter-labs/session-meta` — Claude session metadata. */
  sessionMeta: string;
}

/** Resolved runtime configuration (MIN-11). */
export interface OtterConfig {
  /** Backend listen port. */
  port: number;
  /** Project root directory. */
  projectRoot: string;
  /** Resolved data directory (absolute). */
  dataDir: string;
}

/** Response body of `GET /api/health` (MIN-11 ↔ MIN-13 contract). */
export interface HealthResponse {
  status: "ok";
  uptimeMs: number;
  dataDir: string;
}
