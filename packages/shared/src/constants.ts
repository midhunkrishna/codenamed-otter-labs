/**
 * Frozen contract constants shared across the Otter Labs monorepo.
 * Changing these changes the cross-package contract — coordinate via the channel log.
 */

/** Default local backend port (MIN-11). */
export const DEFAULT_PORT = 4873;

/** All REST endpoints live under this prefix (MIN-13 invariant). */
export const API_PREFIX = "/api";

/** All WebSocket endpoints live under this prefix (MIN-13 invariant). */
export const WS_PREFIX = "/ws";

/** Name of the local-first data directory (MIN-11 / MIN-12). */
export const DATA_DIR_NAME = ".otter-labs";

/** SQLite database filename inside the data directory (MIN-12). */
export const DB_FILE_NAME = "otter.db";

/** Environment variable that overrides the default port. */
export const ENV_PORT = "OTTER_PORT";

/** Environment variable that overrides the data directory location. */
export const ENV_DATA_DIR = "OTTER_DATA_DIR";
