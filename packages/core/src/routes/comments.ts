/**
 * Comment REST routes (MIN-14, plan §3b). Append-only.
 *
 *   GET  /api/tickets/:id/comments → 200 Comment[] (oldest first) | 404 unknown ticket
 *   POST /api/tickets/:id/comments → 201 Comment | 404 | 400 empty body / non-object metadata
 */
import type { FastifyInstance } from "fastify";
import { API_PREFIX, CHANNELS } from "@otter/shared";
import type { Comment } from "@otter/shared";
import type { Emit } from "../events/bus.js";
import type { TicketRepo } from "./tickets.js";

/** Subset of the comment repository this route module consumes (plan §3c). */
export interface CommentRepo {
  create(
    ticketId: string,
    input: { body: string; author?: string; metadata?: Record<string, unknown> },
  ): Comment;
  listByTicket(ticketId: string): Comment[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function registerCommentRoutes(
  app: FastifyInstance,
  tickets: Pick<TicketRepo, "get">,
  comments: CommentRepo,
  emit?: Emit,
): void {
  app.get<{ Params: { id: string } }>(
    `${API_PREFIX}/tickets/:id/comments`,
    async (req, reply) => {
      if (!tickets.get(req.params.id)) return reply.code(404).send({ error: "ticket not found" });
      return comments.listByTicket(req.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/tickets/:id/comments`,
    async (req, reply) => {
      if (!tickets.get(req.params.id)) return reply.code(404).send({ error: "ticket not found" });
      const body = (req.body ?? {}) as {
        body?: unknown;
        author?: unknown;
        metadata?: unknown;
      };
      if (typeof body.body !== "string" || body.body.trim().length === 0) {
        return reply.code(400).send({ error: "body is required and must be a non-empty string" });
      }
      if (body.author !== undefined && typeof body.author !== "string") {
        return reply.code(400).send({ error: "author must be a string" });
      }
      if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
        return reply.code(400).send({ error: "metadata must be a JSON object" });
      }
      const comment = comments.create(req.params.id, {
        body: body.body,
        author: body.author as string | undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      });
      // persisted above, then broadcast (MIN-17): per-ticket + project channels
      emit?.(CHANNELS.ticket(comment.ticketId), "comment_created", {
        id: comment.id,
        ticketId: comment.ticketId,
      });
      emit?.(CHANNELS.project, "comment_created", { id: comment.id, ticketId: comment.ticketId });
      return reply.code(201).send(comment);
    },
  );
}
