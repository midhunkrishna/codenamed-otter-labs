import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { API_PREFIX, WS_PREFIX } from "@otter/shared";
import type { HealthResponse, OtterConfig, OtterPaths } from "@otter/shared";

/** Build a configured Fastify instance for the local Otter backend (MIN-11). */
export async function createServer(
  _config: OtterConfig,
  paths: OtterPaths,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const startedAt = Date.now();

  await app.register(websocket);

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      uptimeMs: Date.now() - startedAt,
      dataDir: paths.dataDir,
    };
  });

  await app.register(async (instance) => {
    instance.get(WS_PREFIX, { websocket: true }, (socket) => {
      socket.send(JSON.stringify({ type: "hello" }));
      socket.on("message", (data: Buffer) => {
        socket.send(data.toString());
      });
    });
  });

  return app;
}
