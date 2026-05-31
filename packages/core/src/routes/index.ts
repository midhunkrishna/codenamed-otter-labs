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
import type { Emit } from "../events/bus.js";
import { registerTicketRoutes } from "./tickets.js";
import { registerCommentRoutes, type ForwardComment } from "./comments.js";
import { registerTransitionRoutes } from "./transitions.js";
import { registerPlanApprovalRoutes } from "./plans.js";
import { registerAttentionRoutes } from "./attention.js";

/**
 * Register all `/api` ticket-core routes, backed by repositories built from `db`.
 * `emit` (optional) is the MIN-17 event bus hook — routes call it AFTER persisting.
 * `forwardComment` (optional, MIN-26) is the SHARED comment-forwarder instance —
 * server.ts builds one `createCommentForwarder(...)` and passes its `forwardComment`
 * here (and to the form service) so the comments route can forward to a parked run.
 */
export function registerTicketCoreRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
  forwardComment?: ForwardComment,
): void {
  const tickets = createTicketRepository(db);
  const comments = createCommentRepository(db);

  registerTicketRoutes(app, tickets, emit);
  registerCommentRoutes(app, tickets, comments, emit, forwardComment);
  registerTransitionRoutes(app, db, tickets, applyTransition, emit);
  registerPlanApprovalRoutes(app, db, emit);
  registerAttentionRoutes(app, db, emit);
}
