/**
 * WebSocket event gateway (MIN-17). Replaces the old `/ws` echo stub.
 *
 * A client opens `/ws`, then sends `{subscribe:"<channel>"}` / `{unsubscribe:"<channel>"}`
 * control messages. The gateway forwards every {@link EventEnvelope} the bus publishes
 * on a subscribed channel. No historical replay over WS — recovery is via HTTP
 * (MIN-17 invariant). The server keeps no per-client state beyond the live socket, so a
 * reconnect (which re-subscribes + refetches) cannot corrupt state.
 *
 * Design notes (Impl-B hardening):
 * - State is per-connection only: a private `Set<string>` of subscribed channels, owned
 *   by the socket handler closure. Nothing is shared across sockets, so a fresh socket
 *   (reconnect) starts empty and cannot observe or corrupt another connection's state.
 * - Multiple channels per socket: subscriptions accumulate in the set; each is matched
 *   independently when fanning out bus envelopes.
 * - Each socket holds exactly one `subscribeAll` registration on the bus and filters by
 *   its own set. On close we unsubscribe that single registration, so a closed socket
 *   leaves no listener behind (no leak, no ghost sends).
 * - Sends are guarded on `readyState === OPEN`: between a publish and the socket actually
 *   closing there is a window where a send would throw; we skip rather than throw.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { WS_PREFIX, isWsClientMessage, type EventEnvelope } from "@otter/shared";
import type { EventBus } from "./bus.js";

/**
 * Cross-Site WebSocket Hijacking guard. The backend binds 127.0.0.1, but a browser
 * will open a `ws://127.0.0.1/ws` socket from ANY page the user visits (the
 * same-origin policy does not gate `WebSocket` the way it gates `fetch`). Browsers
 * attach an `Origin` header on the upgrade, so we reject any cross-origin browser
 * connection. Non-browser clients (no `Origin`, e.g. the CLI / tests) are allowed.
 */
export function isAllowedOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function registerEventGateway(app: FastifyInstance, bus: EventBus): void {
  app.register(async (instance) => {
    instance.get(WS_PREFIX, { websocket: true }, (socket, req: FastifyRequest) => {
      // Reject cross-origin browser connections (see isAllowedOrigin). A missing
      // Origin (native ws client) is allowed; a present, non-local Origin is closed
      // with policy-violation 1008 before any subscription is possible.
      const origin = req.headers.origin;
      if (typeof origin === "string" && origin.length > 0 && !isAllowedOrigin(origin)) {
        socket.close(1008, "forbidden origin");
        return;
      }

      // Per-connection subscription set. The ONLY state this connection owns; it is
      // never shared, so reconnects (fresh sockets) are isolated and cannot corrupt
      // each other (MIN-17: "reconnect does not corrupt state").
      const subscribed = new Set<string>();

      const send = (value: unknown): void => {
        // OPEN === 1 in the WS spec; guard against the closing window.
        if (socket.readyState !== socket.OPEN) return;
        try {
          socket.send(JSON.stringify(value));
        } catch {
          // a dead/closing socket must not break the bus fan-out
        }
      };

      // Greet so clients can confirm the channel is live (no replay — recovery is HTTP).
      send({ type: "hello" });

      // One bus registration per socket; filtered by this connection's own set.
      const unsubscribeBus = bus.subscribeAll((envelope: EventEnvelope) => {
        if (subscribed.has(envelope.channel)) send(envelope);
      });

      socket.on("message", (data: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return; // ignore non-JSON control frames
        }
        if (!isWsClientMessage(msg)) return;
        if ("subscribe" in msg) {
          subscribed.add(msg.subscribe);
        } else if ("unsubscribe" in msg) {
          subscribed.delete(msg.unsubscribe);
        }
      });

      // Closing tears down the single bus registration and clears per-connection state.
      const teardown = (): void => {
        unsubscribeBus();
        subscribed.clear();
      };
      socket.on("close", teardown);
      socket.on("error", teardown);
    });
  });
}
