/**
 * Default-project bootstrap + resolution (MIN-45, plan §3j).
 *
 * On startup (`createServer`, after `initPersistence`) we idempotently upsert the
 * single default local project so that "every run belongs to a project" holds and
 * the recorded root/dataDir always reflect where Otter is actually running. The
 * stable id (`local-project`, seeded by migration 0003) is reused across restarts —
 * a second startup updates root/dataDir/updatedAt rather than minting a new id.
 */
import {
  createProjectRepository,
  type Database,
} from "@otter/persistence";
import { DEFAULT_PROJECT_ID, type Project } from "@otter/shared";

/** Fallback name when the caller does not supply one. */
export const DEFAULT_PROJECT_NAME = "Local Project";

/**
 * Idempotently ensure the default local project exists and reflects the current
 * paths. Returns the persisted {@link Project}. Never silently changes root
 * without writing the record (the upsert always persists what it was given).
 */
export function bootstrapDefaultProject(
  db: Database.Database,
  opts: { name?: string; root: string; dataDir: string },
): Project {
  const projects = createProjectRepository(db);
  return projects.upsertDefault({
    name: opts.name ?? DEFAULT_PROJECT_NAME,
    root: opts.root,
    dataDir: opts.dataDir,
  });
}

/**
 * Resolve the current default project id. A thin helper so services/repos /
 * routes have one reliable place to ask for "the project" without hardcoding the
 * constant everywhere (plan §3j `getCurrentProjectId()`).
 */
export function getCurrentProjectId(): string {
  return DEFAULT_PROJECT_ID;
}

/** Read the current default project (or undefined before bootstrap/migration). */
export function getDefaultProject(db: Database.Database): Project | undefined {
  return createProjectRepository(db).get(DEFAULT_PROJECT_ID);
}
