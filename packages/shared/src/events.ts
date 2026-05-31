/**
 * Live-events contract (MIN-17, runtime-foundations).
 *
 * Frozen, orchestrator-owned. The in-process event bus (`@otter/core`) produces
 * {@link EventEnvelope}s and the WS gateway forwards them to subscribed clients.
 * `@otter/web` mirrors these names locally (node-free bundle). The bus is NOT a
 * source of truth — important events are persisted BEFORE broadcast, and the UI can
 * always recover by re-fetching the HTTP API (MIN-17 invariants).
 */

/** Channel name helpers. A client subscribes to one or more channels by name. */
export const CHANNELS = {
  /** Project-wide stream (tickets list changes, run lifecycle, etc.). */
  project: "project",
  /** Per-ticket stream. */
  ticket: (id: string): string => `ticket:${id}`,
  /** Per-run stream (output deltas, status changes). */
  run: (id: string): string => `run:${id}`,
  /** Attention-queue stream. */
  attention: "attention",
  /** Approvals stream. */
  approvals: "approvals",
} as const;

/** Static (non-parameterized) channel names. */
export const STATIC_CHANNELS = ["project", "attention", "approvals"] as const;

/** Every live event type name (MIN-17 "Event names include ..."). */
export const EVENT_TYPES = [
  "ticket_updated",
  "comment_created",
  "ticket_transitioned",
  "run_created",
  "run_status_changed",
  "run_output_delta",
  "permission_requested",
  "attention_item_created",
  "attention_item_resolved",
  "attention_item_updated",
  "form_created",
  "form_submitted",
  "form_dismissed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * The wire envelope broadcast over `/ws` and published on the in-process bus.
 * `seq`/`ts` let a reconnecting client detect gaps and decide to re-fetch HTTP.
 */
export interface EventEnvelope {
  /** Channel this event belongs to (see {@link CHANNELS}). */
  channel: string;
  /** Event type name (see {@link EVENT_TYPES}). */
  type: EventType;
  /** Monotonic per-bus sequence number, assigned on publish. */
  seq: number;
  /** ISO-8601 publish timestamp. */
  ts: string;
  /** Event-specific JSON payload (ids + minimal data; clients refetch for detail). */
  payload: Record<string, unknown>;
}

/**
 * Payload contract for run-event broadcasts (`run_output_delta`, `run_status_changed`).
 *
 * FROZEN for the MIN-44 producer: persist the `agent_run_event` FIRST, then broadcast
 * its identity. Consumers dedupe live deltas against HTTP-loaded history by `id` (the
 * persisted event id) — NOT by the envelope's bus `seq`, which is a global counter that
 * never matches the per-run `agent_run_event.seq`. A producer that omits `id` cannot be
 * safely deduped; consumers must drop such a live delta and rely on HTTP recovery.
 */
export interface RunEventPayload {
  /** The persisted `agent_run_event.id` — the stable dedupe key. Required. */
  id: string;
  /** The owning run id. */
  runId: string;
  /** Per-run monotonic event seq (matches `AgentRunEvent.seq`) — for ordering. */
  seq: number;
  /** Raw output text, for `run_output_delta` events. */
  text?: string;
}

/** Client → server control messages over `/ws`. */
export type WsClientMessage =
  | { subscribe: string }
  | { unsubscribe: string };

/** True when `msg` is a well-formed {@link WsClientMessage}. */
export function isWsClientMessage(msg: unknown): msg is WsClientMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return typeof m.subscribe === "string" || typeof m.unsubscribe === "string";
}
