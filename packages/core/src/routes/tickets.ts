/**
 * Ticket REST routes (MIN-14, plan §3b).
 *
 *   GET   /api/tickets        → 200 Ticket[]  (created order, oldest first)
 *   POST  /api/tickets        → 201 Ticket    (status=created, blockStatus=none) | 400 empty title
 *   GET   /api/tickets/:id     → 200 Ticket | 404
 *   PATCH /api/tickets/:id     → 200 Ticket | 404 | 400.  NEVER changes status (status is owned by
 *                                POST /transitions — backend is sole lifecycle authority, MIN-15).
 */
import type { FastifyInstance } from "fastify";
import { API_PREFIX } from "@otter/shared";
import type { Ticket } from "@otter/shared";

/** Subset of the ticket repository this route module consumes (plan §3c). */
export interface TicketRepo {
  create(input: { title: string; description?: string }): Ticket;
  get(id: string): Ticket | undefined;
  list(): Ticket[];
  update(id: string, patch: { title?: string; description?: string }): Ticket | undefined;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function registerTicketRoutes(app: FastifyInstance, tickets: TicketRepo): void {
  app.get(`${API_PREFIX}/tickets`, async () => {
    return tickets.list();
  });

  app.post(`${API_PREFIX}/tickets`, async (req, reply) => {
    const body = (req.body ?? {}) as { title?: unknown; description?: unknown };
    if (!isNonEmptyString(body.title)) {
      return reply.code(400).send({ error: "title is required and must be a non-empty string" });
    }
    if (body.description !== undefined && typeof body.description !== "string") {
      return reply.code(400).send({ error: "description must be a string" });
    }
    const ticket = tickets.create({ title: body.title, description: body.description });
    return reply.code(201).send(ticket);
  });

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/tickets/:id`, async (req, reply) => {
    const ticket = tickets.get(req.params.id);
    if (!ticket) return reply.code(404).send({ error: "ticket not found" });
    return ticket;
  });

  app.patch<{ Params: { id: string } }>(`${API_PREFIX}/tickets/:id`, async (req, reply) => {
    const body = (req.body ?? {}) as { title?: unknown; description?: unknown };
    if (body.title !== undefined && !isNonEmptyString(body.title)) {
      return reply.code(400).send({ error: "title must be a non-empty string" });
    }
    if (body.description !== undefined && typeof body.description !== "string") {
      return reply.code(400).send({ error: "description must be a string" });
    }
    if (body.title === undefined && body.description === undefined) {
      return reply.code(400).send({ error: "no updatable fields provided (title, description)" });
    }
    const patch: { title?: string; description?: string } = {};
    if (body.title !== undefined) patch.title = body.title as string;
    if (body.description !== undefined) patch.description = body.description as string;
    const updated = tickets.update(req.params.id, patch);
    if (!updated) return reply.code(404).send({ error: "ticket not found" });
    return updated;
  });
}
