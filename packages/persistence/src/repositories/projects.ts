import type Database from "better-sqlite3";
import { DEFAULT_PROJECT_ID, type Project } from "@otter/shared";

/** Raw snake_case project row as stored in SQLite. */
interface ProjectRow {
  id: string;
  name: string;
  root: string;
  data_dir: string;
  created_at: string;
  updated_at: string;
}

/** Map a snake_case DB row to the camelCase {@link Project} domain object. */
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    root: row.root,
    dataDir: row.data_dir,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProjectRepository {
  /** The seeded default local project (MIN-45). Always present after migration. */
  getDefault(): Project;
  get(id: string): Project | undefined;
  /**
   * Idempotent bootstrap of the default project. Inserts the stable default id
   * if missing, else updates name/root/dataDir/updatedAt. Always reuses the same
   * id (MIN-45 "second startup reuses same project id").
   */
  upsertDefault(input: { name: string; root: string; dataDir: string }): Project;
}

/**
 * Project persistence (MIN-45). The default project is seeded by migration
 * `0003_runtime.sql`; this repo reads it and lets startup refresh its
 * name/root/dataDir idempotently. Returns camelCase domain objects.
 */
export function createProjectRepository(db: Database.Database): ProjectRepository {
  const get = (id: string): Project | undefined => {
    const row = db.prepare("SELECT * FROM project WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  };

  return {
    get,

    getDefault() {
      const project = get(DEFAULT_PROJECT_ID);
      if (!project) {
        throw new Error(`default project "${DEFAULT_PROJECT_ID}" is missing (migration 0003 not applied?)`);
      }
      return project;
    },

    upsertDefault({ name, root, dataDir }) {
      // INSERT the default id if missing, else UPDATE the mutable fields. The
      // stable id is never changed. ON CONFLICT keeps the row idempotent across
      // restarts.
      db.prepare(
        `INSERT INTO project (id, name, root, data_dir)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           root = excluded.root,
           data_dir = excluded.data_dir,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      ).run(DEFAULT_PROJECT_ID, name, root, dataDir);
      return get(DEFAULT_PROJECT_ID)!;
    },
  };
}
