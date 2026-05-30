/**
 * In-process event bus (MIN-17). Orchestrator-owned frozen primitive.
 *
 * Producers (ticket/comment/transition routes, run routes, the future MIN-44 driver)
 * call {@link EventBus.publish} AFTER they have persisted the change — the bus is NOT
 * a source of truth (MIN-17 invariant: persist-before-broadcast; UI recovers via HTTP).
 * The WS gateway (`events/gateway.ts`) subscribes and forwards envelopes to clients.
 */
import type { EventEnvelope, EventType } from "@otter/shared";

type Listener = (envelope: EventEnvelope) => void;

export interface EventBus {
  /**
   * Publish an event to `channel`. Stamps a monotonic `seq` + ISO `ts`, dispatches
   * to that channel's subscribers and to every `subscribeAll` listener, and returns
   * the built envelope. Synchronous; listener exceptions are isolated.
   */
  publish(channel: string, type: EventType, payload?: Record<string, unknown>): EventEnvelope;
  /** Subscribe to one channel. Returns an unsubscribe fn. */
  subscribe(channel: string, fn: Listener): () => void;
  /** Subscribe to every channel (used by the WS gateway to fan out). Returns unsubscribe. */
  subscribeAll(fn: Listener): () => void;
}

/** Create a fresh in-process event bus. One per server instance. */
export function createEventBus(): EventBus {
  const channels = new Map<string, Set<Listener>>();
  const all = new Set<Listener>();
  let seq = 0;

  const dispatch = (envelope: EventEnvelope): void => {
    const direct = channels.get(envelope.channel);
    if (direct) {
      for (const fn of [...direct]) safe(fn, envelope);
    }
    for (const fn of [...all]) safe(fn, envelope);
  };

  return {
    publish(channel, type, payload = {}) {
      seq += 1;
      const envelope: EventEnvelope = {
        channel,
        type,
        seq,
        ts: new Date().toISOString(),
        payload,
      };
      dispatch(envelope);
      return envelope;
    },
    subscribe(channel, fn) {
      let set = channels.get(channel);
      if (!set) {
        set = new Set();
        channels.set(channel, set);
      }
      set.add(fn);
      return () => {
        const s = channels.get(channel);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) channels.delete(channel);
      };
    },
    subscribeAll(fn) {
      all.add(fn);
      return () => all.delete(fn);
    },
  };
}

/** A bound `(channel, type, payload) => void` emit fn — what routes receive. */
export type Emit = (channel: string, type: EventType, payload?: Record<string, unknown>) => void;

/** Isolate a single listener's exception so one bad subscriber can't break a broadcast. */
function safe(fn: Listener, envelope: EventEnvelope): void {
  try {
    fn(envelope);
  } catch {
    // a broken subscriber must not stop the broadcast (bus is best-effort, not truth)
  }
}
