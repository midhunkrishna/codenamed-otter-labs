/**
 * Frontend live-events client (MIN-17).
 *
 * Built on top of the thin `ws/client.ts` `connect()`. Exposes a tiny pub/sub over
 * the backend WS gateway: callers subscribe to a channel and receive parsed
 * {@link EventEnvelope}s; the client manages the socket lifecycle for them.
 *
 * Responsibilities:
 * - Auto-(re)connect: opens a socket immediately and reopens on unexpected close.
 * - Auto re-subscribe: on every (re)connect, re-sends `{subscribe:<channel>}` for
 *   every channel that currently has at least one handler — so a dropped connection
 *   transparently restores all live subscriptions.
 * - JSON envelope parsing + a per-channel handler registry.
 *
 * NON-responsibilities (CRITICAL for MIN-32 / Attention): this client ONLY delivers
 * data. It never scrolls, focuses, or otherwise touches the DOM/viewport. UI layers
 * decide what to do with an envelope; the transport stays inert.
 *
 * Web is standalone and does NOT import `@otter/shared` (node-free bundle); the
 * envelope/channel shapes below are a local mirror of the frozen contract, same
 * convention as `api/client.ts`.
 */
import { connect, type WsConnection } from "./client";

// ---------------------------------------------------------------------------
// Local mirror of the frozen @otter/shared live-events contract (src/events.ts).
// ---------------------------------------------------------------------------

/** Every live event type name (mirror of EVENT_TYPES). */
export type EventType =
  | "ticket_updated"
  | "comment_created"
  | "ticket_transitioned"
  | "run_created"
  | "run_status_changed"
  | "run_output_delta"
  | "permission_requested"
  | "attention_item_created"
  | "attention_item_resolved"
  | "attention_item_updated";

/** The wire envelope broadcast over `/ws` (mirror of EventEnvelope). */
export interface EventEnvelope {
  /** Channel this event belongs to. */
  channel: string;
  /** Event type name. */
  type: EventType;
  /** Monotonic per-bus sequence number. */
  seq: number;
  /** ISO-8601 publish timestamp. */
  ts: string;
  /** Event-specific JSON payload. */
  payload: Record<string, unknown>;
}

/** Channel-name helpers (mirror of CHANNELS). */
export const CHANNELS = {
  project: "project",
  ticket: (id: string): string => `ticket:${id}`,
  run: (id: string): string => `run:${id}`,
  attention: "attention",
  approvals: "approvals",
} as const;

/** A handler receives every envelope delivered on its channel. */
export type EnvelopeHandler = (envelope: EventEnvelope) => void;

/** The live-events client surface (frozen for Impl-E / MIN-32). */
export interface EventsClient {
  /**
   * Subscribe `handler` to `channel`. The first handler for a channel sends a
   * `{subscribe}` control frame; subscriptions are restored automatically across
   * reconnects. Returns an unsubscribe fn; removing the last handler for a channel
   * sends `{unsubscribe}`.
   */
  subscribe(channel: string, handler: EnvelopeHandler): () => void;
  /** Close the connection and stop auto-reconnecting. */
  close(): void;
}

/** Tunables (exposed mainly for tests). */
export interface ConnectEventsOptions {
  /** Delay before a reconnect attempt, ms (default 1000). */
  reconnectDelayMs?: number;
}

/**
 * Open a managed live-events connection.
 *
 * The socket is opened eagerly. Channels gain a subscription lazily as soon as a
 * handler registers, and lose it when the last handler unsubscribes.
 */
export function connectEvents(options: ConnectEventsOptions = {}): EventsClient {
  const reconnectDelayMs = options.reconnectDelayMs ?? 1000;

  // channel -> set of handlers. The key set is the source of truth for what we
  // (re)subscribe to on the wire.
  const handlers = new Map<string, Set<EnvelopeHandler>>();

  let conn: WsConnection | null = null;
  let offMessage: (() => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const sendRaw = (value: unknown): boolean => {
    const socket = conn?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(value));
    return true;
  };

  const dispatch = (data: unknown): void => {
    if (!isEnvelope(data)) return; // ignore the `{type:"hello"}` greeting + noise
    const set = handlers.get(data.channel);
    if (!set) return;
    // Snapshot so a handler that unsubscribes mid-dispatch can't mutate the live set.
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch {
        // a single bad handler must not stop delivery to the others
      }
    }
  };

  // Re-send a subscribe frame for every channel that currently has handlers.
  const resubscribeAll = (): void => {
    for (const channel of handlers.keys()) {
      sendRaw({ subscribe: channel });
    }
  };

  const open = (): void => {
    if (closed) return;
    conn = connect();
    offMessage = conn.onMessage(dispatch);

    conn.socket.addEventListener("open", resubscribeAll);
    conn.socket.addEventListener("close", scheduleReconnect);
    // `error` is followed by `close`; rely on close to drive reconnect.
  };

  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer !== null) return;
    offMessage?.();
    offMessage = null;
    conn = null;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, reconnectDelayMs);
  };

  open();

  return {
    subscribe(channel, handler) {
      let set = handlers.get(channel);
      const isFirst = !set;
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
      }
      set.add(handler);
      // Subscribe on the wire the first time this channel is wanted. If the socket
      // isn't open yet, resubscribeAll() will send it on the next `open`.
      if (isFirst) sendRaw({ subscribe: channel });

      return () => {
        const current = handlers.get(channel);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) {
          handlers.delete(channel);
          sendRaw({ unsubscribe: channel });
        }
      };
    },
    close() {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      offMessage?.();
      offMessage = null;
      handlers.clear();
      conn?.close();
      conn = null;
    },
  };
}

/** Structural guard for an {@link EventEnvelope} arriving over the wire. */
function isEnvelope(data: unknown): data is EventEnvelope {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.channel === "string" &&
    typeof d.type === "string" &&
    typeof d.seq === "number" &&
    typeof d.ts === "string" &&
    typeof d.payload === "object" &&
    d.payload !== null
  );
}
