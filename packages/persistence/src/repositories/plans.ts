import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Plan, PlanStatus } from "@otter/shared";

/** Raw snake_case plan row as stored in SQLite. */
interface PlanRow {
  id: string;
  ticket_id: string;
  run_id: string | null;
  version: number;
  title: string;
  status: string;
  content: string;
  artifact_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Map a snake_case DB row to the camelCase {@link Plan} domain object. */
function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    runId: row.run_id ?? null,
    version: row.version,
    title: row.title,
    status: row.status as PlanStatus,
    content: row.content,
    artifactPath: row.artifact_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PlanRepository {
  /**
   * Create a `proposed` plan. Version = (max version for the ticket) + 1, so
   * versions increment per ticket. Content + version are immutable thereafter.
   */
  createProposed(input: { ticketId: string; runId: string | null; title: string; content: string }): Plan;
  get(id: string): Plan | undefined;
  /** Plans for a ticket, version DESC (newest first). */
  listByTicket(ticketId: string): Plan[];
  /** The highest-version plan for a ticket, or undefined. */
  getLatest(ticketId: string): Plan | undefined;
  /** The ticket's `approved` plan, or undefined. */
  getApproved(ticketId: string): Plan | undefined;
  /**
   * Approve a `proposed` plan. The ONLY writer of `'approved'`. Supersedes any
   * prior approved plan for the same ticket (sets it `superseded`). Throws unless
   * the target plan is currently `proposed`.
   */
  approve(id: string): Plan;
  /** Send a `proposed` plan back (status `sent_back`). Throws unless `proposed`. */
  sendBack(id: string): Plan;
  /** Record the relative artifact path for a plan. */
  setArtifactPath(id: string, relPath: string): Plan;
}

/**
 * Plan persistence (MIN-22 / MIN-23). Owns plan versioning and the approval
 * invariant: at most one `approved` plan per ticket, and `approve` is the only
 * path that writes `'approved'`. Content and version are immutable once created —
 * there is deliberately no content/version updater.
 */
export function createPlanRepository(db: Database.Database): PlanRepository {
  const get = (id: string): Plan | undefined => {
    const row = db.prepare("SELECT * FROM plan WHERE id = ?").get(id) as PlanRow | undefined;
    return row ? rowToPlan(row) : undefined;
  };

  const requireProposed = (id: string): Plan => {
    const existing = get(id);
    if (!existing) {
      throw new Error(`plan "${id}" not found`);
    }
    if (existing.status !== "proposed") {
      throw new Error(`plan "${id}" is ${existing.status}, expected proposed`);
    }
    return existing;
  };

  return {
    createProposed({ ticketId, runId, title, content }) {
      const { max } = db
        .prepare("SELECT COALESCE(MAX(version), 0) AS max FROM plan WHERE ticket_id = ?")
        .get(ticketId) as { max: number };
      const version = max + 1;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO plan (id, ticket_id, run_id, version, title, status, content)
         VALUES (?, ?, ?, ?, ?, 'proposed', ?)`,
      ).run(id, ticketId, runId ?? null, version, title, content);
      return get(id)!;
    },

    get,

    listByTicket(ticketId) {
      const rows = db
        .prepare("SELECT * FROM plan WHERE ticket_id = ? ORDER BY version DESC")
        .all(ticketId) as PlanRow[];
      return rows.map(rowToPlan);
    },

    getLatest(ticketId) {
      const row = db
        .prepare("SELECT * FROM plan WHERE ticket_id = ? ORDER BY version DESC LIMIT 1")
        .get(ticketId) as PlanRow | undefined;
      return row ? rowToPlan(row) : undefined;
    },

    getApproved(ticketId) {
      const row = db
        .prepare("SELECT * FROM plan WHERE ticket_id = ? AND status = 'approved' LIMIT 1")
        .get(ticketId) as PlanRow | undefined;
      return row ? rowToPlan(row) : undefined;
    },

    approve(id) {
      const target = requireProposed(id);
      const run = db.transaction((): Plan => {
        // Supersede any prior approved plan on the same ticket first, so the
        // partial unique index never sees two approved rows.
        db.prepare(
          `UPDATE plan
           SET status = 'superseded', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE ticket_id = ? AND status = 'approved'`,
        ).run(target.ticketId);
        db.prepare(
          `UPDATE plan
           SET status = 'approved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        ).run(id);
        return get(id)!;
      });
      return run();
    },

    sendBack(id) {
      requireProposed(id);
      db.prepare(
        `UPDATE plan
         SET status = 'sent_back', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      ).run(id);
      return get(id)!;
    },

    setArtifactPath(id, relPath) {
      const existing = get(id);
      if (!existing) {
        throw new Error(`plan "${id}" not found`);
      }
      db.prepare(
        `UPDATE plan
         SET artifact_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      ).run(relPath, id);
      return get(id)!;
    },
  };
}
