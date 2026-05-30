import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  type AgentRun,
  type RunListFilter,
  type RunStatus,
  type RunType,
  isRunStatus,
  isRunType,
  isTerminalRunStatus,
} from "@otter/shared";
import { createProjectRepository } from "./projects.js";

/** Raw snake_case agent-run row as stored in SQLite. */
interface AgentRunRow {
  id: string;
  project_id: string;
  ticket_id: string | null;
  type: string;
  status: string;
  title: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Map a snake_case DB row to the camelCase {@link AgentRun} domain object. */
function rowToAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    type: row.type as RunType,
    status: row.status as RunStatus,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export interface AgentRunRepository {
  /**
   * Create a queued run. Validates `type`, defaults `projectId` to the default
   * project, defaults `ticketId` to null, and starts in status `queued`.
   */
  create(input: { type: RunType; ticketId?: string | null; title?: string; projectId?: string }): AgentRun;
  get(id: string): AgentRun | undefined;
  /** List runs newest-first, narrowed by any present filter fields. */
  list(filter?: RunListFilter): AgentRun[];
  /**
   * Set a run's status (validated). Bumps updatedAt; sets startedAt on first
   * entry to `running`; sets finishedAt on entry to a terminal status.
   */
  setStatus(id: string, status: RunStatus): AgentRun | undefined;
  /** Cancel a run. Throws if the run is missing or already terminal. */
  cancel(id: string): AgentRun;
}

/**
 * Agent-run persistence (MIN-19). Generates ids, enforces the frozen run
 * type/status domains, and maintains the lifecycle timestamps. Transition
 * *legality* beyond the terminal-cancel guard is the core's concern.
 */
export function createAgentRunRepository(db: Database.Database): AgentRunRepository {
  const projects = createProjectRepository(db);

  const get = (id: string): AgentRun | undefined => {
    const row = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : undefined;
  };

  const setStatus = (id: string, status: RunStatus): AgentRun | undefined => {
    if (!isRunStatus(status)) {
      throw new Error(`invalid run status: ${String(status)}`);
    }
    const existing = get(id);
    if (!existing) return undefined;

    const enteringRunning = status === "running" && existing.startedAt === null;
    const enteringTerminal = isTerminalRunStatus(status);

    db.prepare(
      `UPDATE agent_runs
       SET status = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           started_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE started_at END,
           finished_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE finished_at END
       WHERE id = ?`,
    ).run(status, enteringRunning ? 1 : 0, enteringTerminal ? 1 : 0, id);

    return get(id);
  };

  return {
    create({ type, ticketId, title, projectId }) {
      if (!isRunType(type)) {
        throw new Error(`invalid run type: ${String(type)}`);
      }
      const resolvedProjectId = projectId ?? projects.getDefault().id;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO agent_runs (id, project_id, ticket_id, type, status, title)
         VALUES (?, ?, ?, ?, 'queued', ?)`,
      ).run(id, resolvedProjectId, ticketId ?? null, type, title ?? "");
      return get(id)!;
    },

    get,

    list(filter) {
      const clauses: string[] = [];
      const params: string[] = [];
      if (filter?.projectId !== undefined) {
        clauses.push("project_id = ?");
        params.push(filter.projectId);
      }
      if (filter?.ticketId !== undefined) {
        clauses.push("ticket_id = ?");
        params.push(filter.ticketId);
      }
      if (filter?.status !== undefined) {
        clauses.push("status = ?");
        params.push(filter.status);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM agent_runs ${where} ORDER BY created_at DESC, rowid DESC`)
        .all(...params) as AgentRunRow[];
      return rows.map(rowToAgentRun);
    },

    setStatus,

    cancel(id) {
      const existing = get(id);
      if (!existing) {
        throw new Error(`run "${id}" not found`);
      }
      if (isTerminalRunStatus(existing.status)) {
        throw new Error(`run "${id}" is already terminal (${existing.status}) and cannot be canceled`);
      }
      return setStatus(id, "canceled")!;
    },
  };
}
