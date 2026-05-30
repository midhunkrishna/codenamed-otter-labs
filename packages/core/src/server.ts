import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { API_PREFIX } from "@otter/shared";
import type { HealthResponse, OtterConfig, OtterPaths } from "@otter/shared";
import {
  createAgentRunRepository,
  createAgentRunEventRepository,
  type Database,
} from "@otter/persistence";
import { registerTicketCoreRoutes } from "./routes/index.js";
import { registerDocsRoutes } from "./routes/docs.js";
import { createEventBus, type Emit } from "./events/bus.js";
import { registerEventGateway } from "./events/gateway.js";
import { registerRuntimeRoutes, bootstrapDefaultProject } from "./runtime/index.js";
import { createClaudeCodeSubprocessRunner } from "./claude/runner.js";
import { createPlanningOrchestrator } from "./runtime/orchestrator.js";
import { writeArtifact } from "./artifacts/writer.js";

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
/** Optional server wiring beyond the DB. `webRoot` (when present on disk) is the
 * built web UI directory served same-origin by the packaged binary; omitted in dev
 * (Vite serves the UI instead). */
export interface CreateServerOptions {
  webRoot?: string;
}

export async function createServer(
  _config: OtterConfig,
  paths: OtterPaths,
  db?: Database.Database,
  opts: CreateServerOptions = {},
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

    // Construct the Claude subprocess runner ONCE (plan §3) and share it with both
    // the start route and the planning orchestrator, so the manual-start path and
    // the auto-plan path drive the same driver.
    const runs = createAgentRunRepository(db);
    const runEvents = createAgentRunEventRepository(db);
    const logsDir = join(paths.dataDir, "logs", "runs");
    try {
      mkdirSync(logsDir, { recursive: true });
    } catch {
      // non-fatal: the runner re-creates the dir before writing.
    }
    const runner = createClaudeCodeSubprocessRunner({
      append: (runId, kind, payload) => runEvents.append(runId, kind, payload),
      emit,
      setRunStatus: (id, status) => runs.setStatus(id, status),
      getRun: (id) => runs.get(id),
      logsDir,
    });

    // Thread the project root (driver cwd) + data dir (run debug logs) so the
    // MIN-44 `POST /api/runs/:id/start` route can spawn Claude under the project.
    registerRuntimeRoutes(
      app,
      db,
      emit,
      { projectRoot: paths.root, dataDir: paths.dataDir },
      runner,
    );

    // MIN-33: Docs / plan-artifact routes (Impl-C).
    registerDocsRoutes(app, db, { dataDir: paths.dataDir });

    // MIN-21/22: auto-planning orchestrator — listens for tickets entering
    // `plannable` and turns finished planning runs into plan artifacts + attention.
    const orchestrator = createPlanningOrchestrator({
      db,
      bus,
      emit,
      runner,
      projectRoot: paths.root,
      dataDir: paths.dataDir,
      writeArtifact,
    });
    orchestrator.start();
  }

  // MIN-17: live event gateway (replaces the old /ws echo).
  registerEventGateway(app, bus);

  // Serve the built web UI same-origin when a web root is supplied AND present on
  // disk (the packaged binary ships assets next to the bundle; dev uses Vite, where
  // no build dir exists, so this is skipped and API 404s keep their `{error}` shape).
  if (opts.webRoot && existsSync(opts.webRoot)) {
    await app.register(fastifyStatic, { root: opts.webRoot, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback: any non-API, non-WS GET serves index.html so client routing works.
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  return app;
}
