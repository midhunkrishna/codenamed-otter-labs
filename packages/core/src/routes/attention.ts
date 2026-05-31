/**
 * Attention API (MIN-36, plan 007 §1.4) — the unified user action queue.
 *
 *   GET  /api/attention                    -> AttentionItem[] (newest first)
 *     query (all optional): status, attention_type, project, ticket
 *   POST /api/attention/:id/dismiss        -> { item } | 404
 *   POST /api/attention/:id/resolve        -> { item } | 404
 *
 * Backend is the lifecycle authority. Each mutation persists THEN emits (MIN-17
 * persist-before-broadcast): `attention_item_resolved` for resolve;
 * `attention_item_updated` for dismiss — on channels `attention` + `project`.
 * The attention queue is NOT a source of truth: dismiss never touches the source.
 * Focus/expansion is purely client-side UI state and is NOT persisted (no focus API).
 */
import type { FastifyInstance } from "fastify";
import {
  createAttentionRepository,
  type Database,
} from "@otter/persistence";
import {
  API_PREFIX,
  CHANNELS,
  ATTENTION_STATUSES,
  ATTENTION_TYPES,
  type AttentionItem,
  type AttentionListFilter,
  type AttentionStatus,
  type AttentionType,
} from "@otter/shared";
import type { Emit } from "../events/bus.js";

/** Broadcast an attention lifecycle event on the attention + project channels. */
function emitAttention(
  emit: Emit | undefined,
  type: "attention_item_resolved" | "attention_item_updated",
  item: AttentionItem,
): void {
  const payload = {
    id: item.id,
    ticketId: item.ticketId,
    attentionType: item.attentionType,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    status: item.status,
  };
  emit?.(CHANNELS.attention, type, payload);
  emit?.(CHANNELS.project, type, payload);
}

/**
 * Register the canonical attention routes, backed by a repo built from `db`
 * (mirrors `registerPlanApprovalRoutes`). `emit` is the MIN-17 hook — called
 * AFTER persist.
 */
export function registerAttentionRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
): void {
  const attention = createAttentionRepository(db);

  app.get<{
    Querystring: {
      status?: string;
      attention_type?: string;
      project?: string;
      ticket?: string;
    };
  }>(`${API_PREFIX}/attention`, async (req) => {
    const { status, attention_type, project, ticket } = req.query;
    const filter: AttentionListFilter = {};
    if (status !== undefined && (ATTENTION_STATUSES as readonly string[]).includes(status)) {
      filter.status = status as AttentionStatus;
    }
    if (
      attention_type !== undefined &&
      (ATTENTION_TYPES as readonly string[]).includes(attention_type)
    ) {
      filter.attentionType = attention_type as AttentionType;
    }
    if (project !== undefined) filter.projectId = project;
    if (ticket !== undefined) filter.ticketId = ticket;
    return attention.list(filter);
  });

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/attention/:id/dismiss`,
    async (req, reply) => {
      if (!attention.get(req.params.id)) {
        return reply.code(404).send({ error: "attention item not found" });
      }
      const item = attention.dismiss(req.params.id);
      emitAttention(emit, "attention_item_updated", item);
      return reply.code(200).send({ item });
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API_PREFIX}/attention/:id/resolve`,
    async (req, reply) => {
      if (!attention.get(req.params.id)) {
        return reply.code(404).send({ error: "attention item not found" });
      }
      const item = attention.resolve(req.params.id);
      emitAttention(emit, "attention_item_resolved", item);
      return reply.code(200).send({ item });
    },
  );
}
