import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AttentionItem, AttentionKind, AttentionStatus } from "@otter/shared";

/** Raw snake_case attention-item row as stored in SQLite. */
interface AttentionItemRow {
  id: string;
  ticket_id: string | null;
  kind: string;
  status: string;
  ref_id: string | null;
  detail: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/** Map a snake_case DB row to the camelCase {@link AttentionItem} domain object. */
function rowToAttentionItem(row: AttentionItemRow): AttentionItem {
  return {
    id: row.id,
    ticketId: row.ticket_id ?? null,
    kind: row.kind as AttentionKind,
    status: row.status as AttentionStatus,
    refId: row.ref_id ?? null,
    detail: row.detail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

export interface AttentionRepository {
  /**
   * Open an attention item. Idempotent per (ticketId, kind): if an `open` item
   * already exists for that pair it is returned as-is (no duplicate, no mutation).
   */
  open(input: { ticketId: string; kind: AttentionKind; refId?: string | null; detail?: string }): AttentionItem;
  get(id: string): AttentionItem | undefined;
  /** List items newest-first, narrowed by any present filter field. */
  list(filter?: { status?: AttentionStatus; ticketId?: string }): AttentionItem[];
  /** Resolve an item by id: sets status `resolved` + `resolved_at`. */
  resolve(id: string): AttentionItem;
  /** Resolve the open item for (ticketId, kind), if any; returns it or undefined. */
  resolveByTicketKind(ticketId: string, kind: AttentionKind): AttentionItem | undefined;
}

/**
 * Attention-queue persistence (MIN-23). Enforces at most one `open` item per
 * (ticket, kind) via an idempotent `open` (backed by the partial unique index).
 */
export function createAttentionRepository(db: Database.Database): AttentionRepository {
  const get = (id: string): AttentionItem | undefined => {
    const row = db.prepare("SELECT * FROM attention_item WHERE id = ?").get(id) as
      | AttentionItemRow
      | undefined;
    return row ? rowToAttentionItem(row) : undefined;
  };

  const findOpen = (ticketId: string, kind: AttentionKind): AttentionItem | undefined => {
    const row = db
      .prepare("SELECT * FROM attention_item WHERE ticket_id = ? AND kind = ? AND status = 'open' LIMIT 1")
      .get(ticketId, kind) as AttentionItemRow | undefined;
    return row ? rowToAttentionItem(row) : undefined;
  };

  const resolve = (id: string): AttentionItem => {
    const existing = get(id);
    if (!existing) {
      throw new Error(`attention item "${id}" not found`);
    }
    db.prepare(
      `UPDATE attention_item
       SET status = 'resolved',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).run(id);
    return get(id)!;
  };

  return {
    open({ ticketId, kind, refId, detail }) {
      const existing = findOpen(ticketId, kind);
      if (existing) return existing;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO attention_item (id, ticket_id, kind, status, ref_id, detail)
         VALUES (?, ?, ?, 'open', ?, ?)`,
      ).run(id, ticketId, kind, refId ?? null, detail ?? "");
      return get(id)!;
    },

    get,

    list(filter) {
      const clauses: string[] = [];
      const params: string[] = [];
      if (filter?.status !== undefined) {
        clauses.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.ticketId !== undefined) {
        clauses.push("ticket_id = ?");
        params.push(filter.ticketId);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM attention_item ${where} ORDER BY created_at DESC, rowid DESC`)
        .all(...params) as AttentionItemRow[];
      return rows.map(rowToAttentionItem);
    },

    resolve,

    resolveByTicketKind(ticketId, kind) {
      const open = findOpen(ticketId, kind);
      if (!open) return undefined;
      return resolve(open.id);
    },
  };
}
