import Database from "better-sqlite3";
import type { OtterPaths } from "@otter/shared";

export type { Database };

/**
 * Open the better-sqlite3 database at `paths.dbFile`.
 *
 * Opening with the default mode CREATES the file if it does not exist and
 * OPENS it in place if it does — it never deletes or truncates an existing
 * `otter.db` (MIN-12 invariant). Callers must have created `paths.dataDir`
 * first (see {@link ensureLayout}).
 *
 * Applies sensible pragmas: WAL journaling for concurrent reads and
 * `foreign_keys=ON` so the schema's FKs are enforced.
 */
export function openDatabase(paths: OtterPaths): Database.Database {
  const db = new Database(paths.dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
