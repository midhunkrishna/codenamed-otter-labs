/**
 * Route registration for the ticket-core API (MIN-14 + MIN-15).
 *
 * Builds the repositories from the better-sqlite3 `db` handle (threaded from
 * `startApp` → `createServer`) via @otter/persistence's factories, then registers
 * the ticket / comment / transition routes against them.
 */
import type { FastifyInstance } from "fastify";
import {
  applyTransition,
  createCommentRepository,
  createTicketRepository,
  type Database,
} from "@otter/persistence";
import { registerTicketRoutes } from "./tickets.js";
import { registerCommentRoutes } from "./comments.js";
import { registerTransitionRoutes } from "./transitions.js";

/** Register all `/api` ticket-core routes, backed by repositories built from `db`. */
export function registerTicketCoreRoutes(app: FastifyInstance, db: Database.Database): void {
  const tickets = createTicketRepository(db);
  const comments = createCommentRepository(db);

  registerTicketRoutes(app, tickets);
  registerCommentRoutes(app, tickets, comments);
  registerTransitionRoutes(app, db, tickets, applyTransition);
}
