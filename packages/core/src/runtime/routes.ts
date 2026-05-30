/**
 * Runtime HTTP routes (MIN-19 runs API + MIN-18 readiness guard + MIN-45 project
 * exposure, plan §3f/§3h/§3j). Registered on the Fastify app by the runtime
 * aggregator. Repos are built here from the better-sqlite3 `db` handle (mirrors
 * `registerTicketCoreRoutes`).
 *
 *   GET  /api/runs?projectId=&ticketId=&status=  -> AgentRun[]   (newest first)
 *   POST /api/runs        { type, ticketId?, title? } -> 201 AgentRun (400 bad type)
 *   GET  /api/runs/:id                            -> AgentRun | 404
 *   GET  /api/runs/:id/events                     -> AgentRunEvent[] (seq asc) | 404
 *   POST /api/runs/:id/cancel                     -> AgentRun | 404 | 409 (terminal)
 *   GET  /api/claude/status                       -> ClaudeStatus
 *   GET  /api/project                             -> Project
 *
 * Invariant (MIN-17): persist BEFORE broadcast — every `emit` happens after the
 * repo write succeeds.
 */
import type { FastifyInstance } from "fastify";
import {
  createAgentRunRepository,
  createAgentRunEventRepository,
  createTicketRepository,
  type Database,
} from "@otter/persistence";
import { API_PREFIX, CHANNELS, isRunStatus, isRunType } from "@otter/shared";
import type { AgentRun, RunListFilter, RunStatus, RunType } from "@otter/shared";
import type { Emit } from "../events/bus.js";
import { getCachedClaudeStatus, refreshClaudeStatus } from "../claude/detect.js";
import { getDefaultProject } from "../project/bootstrap.js";

/** Run types that require a ready Claude before they can actually execute. */
const CLAUDE_REQUIRED_TYPES: ReadonlySet<RunType> = new Set<RunType>(["planning", "execution"]);

/** Broadcast a run lifecycle event on both the project + per-run channels. */
function emitRun(
  emit: Emit | undefined,
  type: "run_created" | "run_status_changed",
  run: AgentRun,
): void {
  const payload = { id: run.id, status: run.status, type: run.type, ticketId: run.ticketId };
  emit?.(CHANNELS.project, type, payload);
  emit?.(CHANNELS.run(run.id), type, payload);
}

export function registerRuntimeHttpRoutes(
  app: FastifyInstance,
  db: Database.Database,
  emit?: Emit,
): void {
  const runs = createAgentRunRepository(db);
  const runEvents = createAgentRunEventRepository(db);
  const tickets = createTicketRepository(db);

  // ---- Runs ---------------------------------------------------------------

  app.get<{ Querystring: { projectId?: string; ticketId?: string; status?: string } }>(
    `${API_PREFIX}/runs`,
    async (req, reply) => {
      const { projectId, ticketId, status } = req.query;
      if (status !== undefined && !isRunStatus(status)) {
        return reply.code(400).send({ error: `invalid status filter: ${status}` });
      }
      const filter: RunListFilter = {};
      if (projectId !== undefined) filter.projectId = projectId;
      if (ticketId !== undefined) filter.ticketId = ticketId;
      if (status !== undefined) filter.status = status as RunStatus;
      return runs.list(filter);
    },
  );

  app.post(`${API_PREFIX}/runs`, async (req, reply) => {
    const body = (req.body ?? {}) as { type?: unknown; ticketId?: unknown; title?: unknown };
    if (!isRunType(body.type)) {
      return reply.code(400).send({ error: "type is required and must be one of planning|execution|manual|review" });
    }
    if (body.ticketId !== undefined && body.ticketId !== null && typeof body.ticketId !== "string") {
      return reply.code(400).send({ error: "ticketId must be a string or null" });
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      return reply.code(400).send({ error: "title must be a string" });
    }

    const type = body.type;
    // Normalize ticketId: empty/whitespace string means "no ticket" (a non-ticket
    // run), NOT an empty FK — `?? null` alone would let "" through to the INSERT.
    const trimmedTicketId = typeof body.ticketId === "string" ? body.ticketId.trim() : null;
    const ticketId = trimmedTicketId !== null && trimmedTicketId !== "" ? trimmedTicketId : null;
    const title = (body.title as string | undefined) ?? "";

    // A ticket-scoped run MUST reference an existing ticket — otherwise the FK trips
    // with a raw 500 (SQLITE_CONSTRAINT_FOREIGNKEY). Validate up front so the error
    // honors the `{error}` contract (404), and so a bad id can never reach the INSERT.
    if (ticketId !== null && !tickets.get(ticketId)) {
      return reply.code(404).send({ error: "ticket not found" });
    }

    // Persist the run first (always created — even when we then fail it, so the
    // failure is durable + queryable; acceptance: "fail gracefully").
    const created = runs.create({ type, ticketId, title });

    // Run-creation guard (MIN-18): planning/execution need a ready Claude.
    if (CLAUDE_REQUIRED_TYPES.has(type)) {
      const claude = await getCachedClaudeStatus();
      if (!claude.ready) {
        const failed = runs.setStatus(created.id, "failed") ?? created;
        // MIN-19: record the status change as an append-only event (persist before broadcast).
        runEvents.append(created.id, "status_changed", { from: "queued", to: "failed" });
        runEvents.append(created.id, "log", {
          message:
            `Claude Code is not ready, so this ${type} run cannot start. ` +
            `${claude.error ?? "Run `claude --version` to verify the install."} ` +
            `Once Claude is available, create the run again.`,
        });
        emitRun(emit, "run_created", failed);
        emitRun(emit, "run_status_changed", failed);
        return reply.code(201).send(failed);
      }
    }

    // Ready (or a type with no Claude requirement): leave it queued.
    emitRun(emit, "run_created", created);
    return reply.code(201).send(created);
  });

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/runs/:id`, async (req, reply) => {
    const run = runs.get(req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });

  app.get<{ Params: { id: string } }>(`${API_PREFIX}/runs/:id/events`, async (req, reply) => {
    const run = runs.get(req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return runEvents.list(req.params.id);
  });

  app.post<{ Params: { id: string } }>(`${API_PREFIX}/runs/:id/cancel`, async (req, reply) => {
    const existing = runs.get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "run not found" });
    try {
      const canceled = runs.cancel(req.params.id);
      // MIN-19: record the status change as an append-only event, then broadcast.
      runEvents.append(canceled.id, "status_changed", { from: existing.status, to: canceled.status });
      emitRun(emit, "run_status_changed", canceled);
      return canceled;
    } catch (err) {
      // Repo throws when the run is already terminal → 409 conflict.
      return reply.code(409).send({ error: err instanceof Error ? err.message : "cannot cancel run" });
    }
  });

  // ---- Claude readiness (MIN-18) -----------------------------------------

  app.get(`${API_PREFIX}/claude/status`, async () => {
    // Re-probe on demand (acceptance: status re-probes), refreshing the cache.
    return refreshClaudeStatus();
  });

  // ---- Project exposure (MIN-45) -----------------------------------------

  app.get(`${API_PREFIX}/project`, async (_req, reply) => {
    const project = getDefaultProject(db);
    if (!project) return reply.code(404).send({ error: "default project not found" });
    return project;
  });
}
