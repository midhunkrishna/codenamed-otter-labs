/**
 * Runtime barrel (Impl-C, plan §3f/§3h/§3j — MIN-19 / MIN-18 / MIN-45).
 *
 * Public surface consumed by the orchestrator-owned `server.ts` (signatures are
 * frozen — do not change them):
 *   - registerRuntimeRoutes(app, db, emit?) — runs + claude + project HTTP routes
 *   - detectClaude(opts?)                    — Claude readiness probe
 *   - bootstrapDefaultProject(db, opts)      — idempotent default-project upsert
 *
 * Implementations live in sibling modules (`./routes`, `../claude/detect`,
 * `../project/bootstrap`) and are re-exported here so the barrel stays stable.
 */
import type { FastifyInstance } from "fastify";
import type { Database } from "@otter/persistence";
import type { Emit } from "../events/bus.js";
import { registerRuntimeHttpRoutes } from "./routes.js";

export { detectClaude, type ClaudeStatus } from "../claude/detect.js";
export { bootstrapDefaultProject, getCurrentProjectId } from "../project/bootstrap.js";

/**
 * Register the runtime HTTP routes (runs, claude status, project) on `app`,
 * backed by repos built from `db`. `emit` is the MIN-17 bus hook — called only
 * AFTER each repo write (persist-before-broadcast).
 */
export function registerRuntimeRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
): void {
  registerRuntimeHttpRoutes(app, db, emit);
}
