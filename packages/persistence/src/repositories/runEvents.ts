import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  type AgentRunEvent,
  type RunEventKind,
  RUN_EVENT_KINDS,
} from "@otter/shared";

/** Raw snake_case agent-run-event row as stored in SQLite. */
interface AgentRunEventRow {
  id: string;
  run_id: string;
  seq: number;
  kind: string;
  payload: string;
  created_at: string;
}

/** Map a snake_case DB row to the camelCase {@link AgentRunEvent} domain object. */
function rowToAgentRunEvent(row: AgentRunEventRow): AgentRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    kind: row.kind as RunEventKind,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

/** True when `value` is a member of {@link RUN_EVENT_KINDS}. */
function isRunEventKind(value: unknown): value is RunEventKind {
  return typeof value === "string" && (RUN_EVENT_KINDS as readonly string[]).includes(value);
}

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface AgentRunEventRepository {
  /**
   * Append an event to a run. Assigns the next per-run seq (max+1, starting at
   * 1), validates `kind`, and persists `payload` as JSON. Atomic under the
   * single connection (seq read + insert run in one transaction).
   */
  append(runId: string, kind: RunEventKind, payload?: Record<string, unknown>): AgentRunEvent;
  /** List a run's events, seq ascending. */
  list(runId: string): AgentRunEvent[];
}

/**
 * Append-only per-run event log (MIN-19 / MIN-44 seam). The append seam where the
 * future Claude-Code executor (and the event bus broadcast) plug in.
 */
export function createAgentRunEventRepository(db: Database.Database): AgentRunEventRepository {
  const nextSeqStmt = db.prepare(
    "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM agent_run_events WHERE run_id = ?",
  );
  const insertStmt = db.prepare(
    `INSERT INTO agent_run_events (id, run_id, seq, kind, payload)
     VALUES (?, ?, ?, ?, ?)`,
  );

  return {
    append(runId, kind, payload) {
      if (!isRunEventKind(kind)) {
        throw new Error(`invalid run event kind: ${String(kind)}`);
      }
      const data = payload === undefined ? {} : payload;
      if (!isPlainObject(data)) {
        throw new Error("run event payload must be a plain JSON object");
      }
      let payloadJson: string;
      try {
        payloadJson = JSON.stringify(data);
      } catch (cause) {
        throw new Error("run event payload must be JSON-serializable", { cause });
      }
      if (payloadJson === undefined) {
        throw new Error("run event payload must be JSON-serializable");
      }

      const id = randomUUID();
      // Read next seq + insert atomically so concurrent appends on the same
      // connection cannot collide on (run_id, seq).
      const insert = db.transaction(() => {
        const { next } = nextSeqStmt.get(runId) as { next: number };
        insertStmt.run(id, runId, next, kind, payloadJson);
      });
      insert();

      const row = db.prepare("SELECT * FROM agent_run_events WHERE id = ?").get(id) as AgentRunEventRow;
      return rowToAgentRunEvent(row);
    },

    list(runId) {
      const rows = db
        .prepare("SELECT * FROM agent_run_events WHERE run_id = ? ORDER BY seq ASC")
        .all(runId) as AgentRunEventRow[];
      return rows.map(rowToAgentRunEvent);
    },
  };
}
