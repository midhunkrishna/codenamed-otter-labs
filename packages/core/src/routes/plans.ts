/**
 * Plan approval API (MIN-23, plan §2.6). The Attention list/mutation API moved to
 * `routes/attention.ts` (MIN-36, plan 007 §1.4); this module only RESOLVES the
 * plan_approval attention item when a plan decision is made.
 *
 *   GET  /api/tickets/:id/plans          -> Plan[]  (version DESC) | 404
 *   GET  /api/plans/:id                  -> Plan | 404
 *   POST /api/plans/:id/approve          -> { ticket, plan } | 404 | 409
 *   POST /api/plans/:id/send-back        -> { ticket, plan } | 404 | 409 | 400
 *
 * Backend is the sole lifecycle authority. Approve drives needs_user_approval → executable
 * (with `planApproved=true`); send-back drives needs_user_approval → plannable (which the
 * orchestrator hears on CHANNELS.project to re-plan). Persist BEFORE broadcast.
 */
import type { FastifyInstance } from "fastify";
import {
  applyTransition,
  createAttentionRepository,
  createCommentRepository,
  createPlanRepository,
  createTicketRepository,
  type Database,
} from "@otter/persistence";
import { API_PREFIX, CHANNELS } from "@otter/shared";
import { canTransition, type TransitionContext } from "../lifecycle.js";
import type { Emit } from "../events/bus.js";

/** Broadcast a ticket transition on the per-ticket + project channels (mirrors the route payload). */
function emitTransitioned(
  emit: Emit | undefined,
  id: string,
  from: string,
  to: string,
): void {
  const payload = { id, from, to };
  emit?.(CHANNELS.ticket(id), "ticket_transitioned", payload);
  emit?.(CHANNELS.project, "ticket_transitioned", payload);
}

/** Broadcast an attention resolution on the attention + project channels. */
function emitAttentionResolved(emit: Emit | undefined, attentionId: string, ticketId: string): void {
  const payload = { id: attentionId, ticketId };
  emit?.(CHANNELS.attention, "attention_item_resolved", payload);
  emit?.(CHANNELS.project, "attention_item_resolved", payload);
}

/**
 * Register the plan-approval + attention routes, backed by repos built from `db`
 * (mirrors `registerTicketCoreRoutes`). `emit` is the MIN-17 hook — called AFTER persist.
 */
export function registerPlanApprovalRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
): void {
  const plans = createPlanRepository(db);
  const attention = createAttentionRepository(db);
  const comments = createCommentRepository(db);
  const tickets = createTicketRepository(db);

  app.get<{ Params: { id: string } }>(
    `${API_PREFIX}/tickets/:id/plans`,
    async (req, reply) => {
      if (!tickets.get(req.params.id)) return reply.code(404).send({ error: "ticket not found" });
      return plans.listByTicket(req.params.id);
    },
  );

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/plans/:id`, async (req, reply) => {
    const plan = plans.get(req.params.id);
    if (!plan) return reply.code(404).send({ error: "plan not found" });
    return plan;
  });

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/plans/:id/approve`,
    async (req, reply) => {
      const plan = plans.get(req.params.id);
      if (!plan) return reply.code(404).send({ error: "plan not found" });
      const ticket = tickets.get(plan.ticketId);
      if (!ticket) return reply.code(404).send({ error: "ticket not found" });

      if (plan.status !== "proposed") {
        return reply.code(409).send({ error: `plan is ${plan.status}, expected proposed` });
      }
      if (ticket.status !== "needs_user_approval") {
        return reply
          .code(409)
          .send({ error: `ticket is ${ticket.status}, expected needs_user_approval` });
      }
      const ctx: TransitionContext = { blockStatus: ticket.blockStatus, planApproved: true };
      if (!canTransition(ticket.status, "executable", ctx)) {
        return reply
          .code(409)
          .send({ error: `transition ${ticket.status} → executable is not allowed` });
      }

      // --- persist (atomic-per-step), THEN broadcast ---
      const approvedPlan = plans.approve(plan.id);
      tickets.setApprovedPlan(ticket.id, approvedPlan.id);
      const { ticket: updated } = applyTransition(db, {
        ticketId: ticket.id,
        fromStatus: ticket.status,
        toStatus: "executable",
        detail: "plan approved",
      });
      const resolved = attention.resolveBySource("plan", plan.id, "plan_approval");

      emitTransitioned(emit, updated.id, ticket.status, updated.status);
      if (resolved) emitAttentionResolved(emit, resolved.id, ticket.id);

      return reply.code(200).send({ ticket: updated, plan: approvedPlan });
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/plans/:id/send-back`,
    async (req, reply) => {
      const plan = plans.get(req.params.id);
      if (!plan) return reply.code(404).send({ error: "plan not found" });
      const ticket = tickets.get(plan.ticketId);
      if (!ticket) return reply.code(404).send({ error: "ticket not found" });

      const body = (req.body ?? {}) as { feedback?: unknown };
      if (typeof body.feedback !== "string" || body.feedback.trim().length === 0) {
        return reply.code(400).send({ error: "feedback is required and must be a non-empty string" });
      }
      if (plan.status !== "proposed") {
        return reply.code(409).send({ error: `plan is ${plan.status}, expected proposed` });
      }
      if (ticket.status !== "needs_user_approval") {
        return reply
          .code(409)
          .send({ error: `ticket is ${ticket.status}, expected needs_user_approval` });
      }

      // --- persist (atomic-per-step), THEN broadcast ---
      const sentBack = plans.sendBack(plan.id);
      comments.create(ticket.id, {
        body: body.feedback,
        author: "user",
        metadata: { kind: "plan_feedback", planId: plan.id },
      });
      const { ticket: updated } = applyTransition(db, {
        ticketId: ticket.id,
        fromStatus: ticket.status,
        toStatus: "plannable",
        detail: "plan sent back",
      });
      const resolved = attention.resolveBySource("plan", plan.id, "plan_approval");

      emitTransitioned(emit, updated.id, ticket.status, updated.status);
      if (resolved) emitAttentionResolved(emit, resolved.id, ticket.id);

      return reply.code(200).send({ ticket: updated, plan: sentBack });
    },
  );
}
