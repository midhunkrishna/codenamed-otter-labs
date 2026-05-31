/**
 * Comment REST routes (MIN-14 + MIN-26, plan §3b/§2.6). Append-only.
 *
 *   GET  /api/tickets/:id/comments → 200 Comment[] (oldest first) | 404 unknown ticket
 *   POST /api/tickets/:id/comments → 201 Comment | 404 | 400 empty body / non-object metadata
 *
 * The create route accepts an optional `sendToAgent?: boolean` and, after the
 * comment is persisted + broadcast, hands it to an INJECTED `forwardComment`
 * (MIN-26). Forwarding is awaited but its failure must never fail the request or
 * lose the comment — the comment is already persisted, so a forward error is
 * swallowed here (the forwarder records its own error run event).
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

/** Injected MIN-26 forwarding hook (the shared forwarder's `forwardComment`). */
export type ForwardComment = (comment: Comment) => Promise<void>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function registerCommentRoutes(
  app: FastifyInstance,
  tickets: Pick<TicketRepo, "get">,
  comments: CommentRepo,
  emit?: Emit,
  forwardComment?: ForwardComment,
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
        sendToAgent?: unknown;
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
      if (body.sendToAgent !== undefined && typeof body.sendToAgent !== "boolean") {
        return reply.code(400).send({ error: "sendToAgent must be a boolean" });
      }

      // The forwarder reads `sendToAgent` off metadata (§1.2). Fold the optional
      // top-level flag in so it travels with the persisted comment.
      const metadata = { ...(body.metadata as Record<string, unknown> | undefined) };
      if (body.sendToAgent !== undefined) metadata.sendToAgent = body.sendToAgent;

      const comment = comments.create(req.params.id, {
        body: body.body,
        author: body.author as string | undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      // persisted above, then broadcast (MIN-17): per-ticket + project channels
      emit?.(CHANNELS.ticket(comment.ticketId), "comment_created", {
        id: comment.id,
        ticketId: comment.ticketId,
      });
      emit?.(CHANNELS.project, "comment_created", { id: comment.id, ticketId: comment.ticketId });

      // MIN-26: forward to a parked Claude session (fire-and-forget but awaited-
      // safe). A forward failure must NEVER fail the request or lose the comment —
      // the comment is already persisted; the forwarder records its own error.
      if (forwardComment) {
        try {
          await forwardComment(comment);
        } catch {
          // never propagate — the comment is persisted regardless.
        }
      }
      return reply.code(201).send(comment);
    },
  );
}
