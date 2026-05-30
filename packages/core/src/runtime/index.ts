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
import { registerRuntimeHttpRoutes, type RuntimeRoutesPaths } from "./routes.js";
import type { ClaudeRunner } from "../claude/types.js";

export { detectClaude, type ClaudeStatus } from "../claude/detect.js";
export { bootstrapDefaultProject, getCurrentProjectId } from "../project/bootstrap.js";

/**
 * Register the runtime HTTP routes (runs, claude status, project, run start) on
 * `app`, backed by repos built from `db`. `emit` is the MIN-17 bus hook — called
 * only AFTER each repo write (persist-before-broadcast). `paths` carries the
 * project root (driver cwd) + data dir (debug logs) the MIN-44 start route needs;
 * `runner` lets tests inject a fake subprocess runner.
 */
export function registerRuntimeRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
  paths?: RuntimeRoutesPaths,
  runner?: ClaudeRunner,
): void {
  registerRuntimeHttpRoutes(app, db, emit, paths, runner);
}

export type { RuntimeRoutesPaths } from "./routes.js";
