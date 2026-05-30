/**
 * Lifecycle transition routes (MIN-15, plan §3b). The ONLY way ticket.status changes —
 * backend is the sole lifecycle authority.
 *
 *   GET  /api/tickets/:id/transitions → 200 {current, next: nextTransitions(current, ctx)} | 404
 *   POST /api/tickets/:id/transitions {to, detail?}
 *        → 200 Ticket (status changed + one ticket_event written, atomically via applyTransition)
 *        → 404 unknown ticket | 400 invalid/disallowed transition (clear message)
 *
 * Whether a transition is legal is decided here (canTransition); persistence guarantees the
 * status-change + event-insert are atomic (applyTransition).
 */
import type { FastifyInstance } from "fastify";
import { API_PREFIX, CHANNELS, isTicketStatus } from "@otter/shared";
import type { Ticket, TicketEvent, TicketStatus } from "@otter/shared";
import type { Database } from "@otter/persistence";
import { canTransition, nextTransitions, type TransitionContext } from "../lifecycle.js";
import type { Emit } from "../events/bus.js";
import type { TicketRepo } from "./tickets.js";

/** Transactional transition applier from @otter/persistence (plan §3c). */
export type ApplyTransition = (
  db: Database.Database,
  args: {
    ticketId: string;
    fromStatus: TicketStatus | null;
    toStatus: TicketStatus;
    detail: string;
  },
) => { ticket: Ticket; event: TicketEvent };

export function registerTransitionRoutes(
  app: FastifyInstance,
  db: Database.Database,
  tickets: Pick<TicketRepo, "get">,
  applyTransition: ApplyTransition,
  emit?: Emit,
): void {
  app.get<{ Params: { id: string } }>(
    `${API_PREFIX}/tickets/:id/transitions`,
    async (req, reply) => {
      const ticket = tickets.get(req.params.id);
      if (!ticket) return reply.code(404).send({ error: "ticket not found" });
      const ctx: TransitionContext = { blockStatus: ticket.blockStatus };
      return { current: ticket.status, next: nextTransitions(ticket.status, ctx) };
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/tickets/:id/transitions`,
    async (req, reply) => {
      const ticket = tickets.get(req.params.id);
      if (!ticket) return reply.code(404).send({ error: "ticket not found" });

      const body = (req.body ?? {}) as { to?: unknown; detail?: unknown };
      if (!isTicketStatus(body.to)) {
        return reply.code(400).send({ error: "to must be a valid ticket status" });
      }
      if (body.detail !== undefined && typeof body.detail !== "string") {
        return reply.code(400).send({ error: "detail must be a string" });
      }
      const to = body.to;
      const ctx: TransitionContext = { blockStatus: ticket.blockStatus };
      if (!canTransition(ticket.status, to, ctx)) {
        const reason =
          to === "in_progress" && ticket.blockStatus !== "none"
            ? `cannot transition to in_progress while ticket is ${ticket.blockStatus}`
            : `transition ${ticket.status} → ${to} is not allowed`;
        return reply.code(400).send({ error: reason });
      }

      const { ticket: updated } = applyTransition(db, {
        ticketId: ticket.id,
        fromStatus: ticket.status,
        toStatus: to,
        detail: typeof body.detail === "string" ? body.detail : "",
      });
      // persisted atomically above, then broadcast (MIN-17)
      const payload = { id: updated.id, from: ticket.status, to: updated.status };
      emit?.(CHANNELS.ticket(updated.id), "ticket_transitioned", payload);
      emit?.(CHANNELS.project, "ticket_transitioned", payload);
      return reply.code(200).send(updated);
    },
  );
}
