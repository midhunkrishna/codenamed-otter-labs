import type { OtterPaths } from "@otter/shared";
import { ensureLayout } from "./layout.js";
import { openDatabase, type Database } from "./database.js";
import { runMigrations } from "./migrations.js";

export { ensureLayout } from "./layout.js";
export { openDatabase, type Database } from "./database.js";
export { runMigrations, MIGRATIONS_DIR, type MigrationResult } from "./migrations.js";

export {
  createTicketRepository,
  type TicketRepository,
} from "./repositories/tickets.js";
export {
  createCommentRepository,
  type CommentRepository,
} from "./repositories/comments.js";
export {
  createTicketEventRepository,
  type TicketEventRepository,
} from "./repositories/events.js";
export {
  applyTransition,
  type ApplyTransitionInput,
  type ApplyTransitionResult,
} from "./repositories/transitions.js";
export {
  createProjectRepository,
  type ProjectRepository,
} from "./repositories/projects.js";
export {
  createAgentRunRepository,
  type AgentRunRepository,
} from "./repositories/runs.js";
export {
  createAgentRunEventRepository,
  type AgentRunEventRepository,
} from "./repositories/runEvents.js";
export {
  createPlanRepository,
  type PlanRepository,
} from "./repositories/plans.js";
export {
  createAttentionRepository,
  type AttentionRepository,
} from "./repositories/attention.js";

/** Result of {@link initPersistence}. */
export interface InitResult {
  db: Database.Database;
  applied: string[];
}

/**
 * One-call persistence startup, consumed by `@otter/core`.
 *
 * Creates the directory layout, opens (or creates) `otter.db`, and applies any
 * pending migrations. Never deletes an existing database. A failed migration
 * throws, which fails startup (MIN-12 invariant). Safe to run repeatedly.
 */
export function initPersistence(paths: OtterPaths): InitResult {
  ensureLayout(paths);
  const db = openDatabase(paths);
  const { applied } = runMigrations(db);
  return { db, applied };
}
