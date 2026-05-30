import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { API_PREFIX } from "@otter/shared";
import type { HealthResponse, OtterConfig, OtterPaths } from "@otter/shared";
import type { Database } from "@otter/persistence";
import { registerTicketCoreRoutes } from "./routes/index.js";
import { createEventBus, type Emit } from "./events/bus.js";
import { registerEventGateway } from "./events/gateway.js";
import { registerRuntimeRoutes, bootstrapDefaultProject } from "./runtime/index.js";

/**
 * Build a configured Fastify instance for the local Otter backend (MIN-11).
 *
 * `db` is the better-sqlite3 handle from persistence (`initPersistence().db`),
 * threaded through so the ticket-core (MIN-14/15) and runtime (MIN-17/18/19/45)
 * routes can build their repos. When omitted (some unit tests), only `/api/health`
 * + the `/ws` gateway are registered.
 *
 * The in-process event bus (MIN-17) is created here and an `emit` fn is threaded into
 * the mutation routes; the WS gateway forwards bus envelopes to subscribed clients.
 * Routes persist BEFORE they emit (bus is not source of truth).
 */
export async function createServer(
  _config: OtterConfig,
  paths: OtterPaths,
  db?: Database.Database,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const startedAt = Date.now();

  await app.register(websocket);

  const bus = createEventBus();
  const emit: Emit = (channel, type, payload) => {
    bus.publish(channel, type, payload);
  };

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      uptimeMs: Date.now() - startedAt,
      dataDir: paths.dataDir,
    };
  });

  if (db !== undefined) {
    // MIN-45: ensure the default local project exists before ticket/run creation.
    bootstrapDefaultProject(db, { root: paths.root, dataDir: paths.dataDir });
    registerTicketCoreRoutes(app, db, emit);
    // Thread the project root (driver cwd) + data dir (run debug logs) so the
    // MIN-44 `POST /api/runs/:id/start` route can spawn Claude under the project.
    registerRuntimeRoutes(app, db, emit, {
      projectRoot: paths.root,
      dataDir: paths.dataDir,
    });
  }

  // MIN-17: live event gateway (replaces the old /ws echo).
  registerEventGateway(app, bus);

  return app;
}
