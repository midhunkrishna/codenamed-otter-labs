/**
 * WebSocket client stub for the Otter Labs backend.
 *
 * Real-shaped but intentionally thin: it builds the same-origin `/ws` URL
 * (proxied by Vite to the backend) and wraps open/onMessage/close. The backend
 * stub currently just accepts and echoes `{type:"hello"}`.
 */

/** All WebSocket endpoints live under this prefix (MIN-13 invariant). */
export const WS_PREFIX = "/ws";

export interface WsConnection {
  /** The underlying socket (exposed for advanced use/testing). */
  readonly socket: WebSocket;
  /** Register a message handler. Returns an unsubscribe function. */
  onMessage(handler: (data: unknown) => void): () => void;
  /** Close the connection. */
  close(): void;
}

/** Builds the same-origin WebSocket URL for the `/ws` endpoint. */
export function wsUrl(path = ""): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${WS_PREFIX}${path}`;
}

/** Opens a WebSocket connection and returns a thin wrapper. */
export function connect(path = ""): WsConnection {
  const socket = new WebSocket(wsUrl(path));

  return {
    socket,
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        let data: unknown = event.data;
        try {
          data = JSON.parse(event.data);
        } catch {
          // leave as raw string if not JSON
        }
        handler(data);
      };
      socket.addEventListener("message", listener);
      return () => socket.removeEventListener("message", listener);
    },
    close() {
      socket.close();
    },
  };
}
