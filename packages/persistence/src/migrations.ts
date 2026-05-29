import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

/** Default migrations directory, resolved relative to this module. */
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** Result of a migration run: the migration filenames applied this run. */
export interface MigrationResult {
  applied: string[];
}

/** Ensure the bookkeeping table exists. Owned by the runner, not a migration file. */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
       name        TEXT PRIMARY KEY,
       applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     );`,
  );
}

/** Migration filenames already recorded as applied, as a fast lookup set. */
function appliedNames(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM migrations").all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** Discover `.sql` migration files in lexical (deterministic) order. */
function discoverMigrations(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Apply pending migrations.
 *
 * - Ensures the `migrations` bookkeeping table.
 * - Reads `.sql` files from `migrationsDir` (default {@link MIGRATIONS_DIR}) in
 *   lexical order.
 * - Applies each pending file inside its own transaction, then records it.
 * - Skips files already recorded (idempotent across runs).
 * - On any failure the transaction rolls back and a clear Error is thrown so
 *   that startup fails (MIN-12 invariant).
 */
export function runMigrations(
  db: Database.Database,
  migrationsDir: string = MIGRATIONS_DIR,
): MigrationResult {
  ensureMigrationsTable(db);
  const already = appliedNames(db);
  const files = discoverMigrations(migrationsDir);
  const applied: string[] = [];

  for (const name of files) {
    if (already.has(name)) continue;

    let sql: string;
    try {
      sql = readFileSync(join(migrationsDir, name), "utf8");
    } catch (cause) {
      throw new Error(`Migration "${name}" could not be read from ${migrationsDir}`, { cause });
    }

    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (name) VALUES (?)").run(name);
    });

    try {
      apply();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Migration "${name}" failed and was rolled back: ${reason}`, { cause });
    }

    applied.push(name);
  }

  return { applied };
}
