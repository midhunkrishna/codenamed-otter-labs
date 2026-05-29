import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  type BlockStatus,
  type Ticket,
  type TicketStatus,
  isBlockStatus,
  isTicketStatus,
} from "@otter/shared";

/** Raw snake_case ticket row as stored in SQLite. */
interface TicketRow {
  id: string;
  title: string;
  description: string;
  status: string;
  block_status: string;
  created_at: string;
  updated_at: string;
}

/** Map a snake_case DB row to the camelCase {@link Ticket} domain object. */
function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    blockStatus: row.block_status as BlockStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TicketRepository {
  create(input: { title: string; description?: string }): Ticket;
  get(id: string): Ticket | undefined;
  list(): Ticket[];
  update(id: string, patch: { title?: string; description?: string }): Ticket | undefined;
  setStatus(id: string, status: TicketStatus, blockStatus?: BlockStatus): Ticket | undefined;
}

/**
 * Ticket persistence. Generates ids, enforces a non-empty title, seeds new rows
 * with status=`created` / blockStatus=`none`, and returns camelCase domain
 * objects. Status values are validated against the frozen domain enums;
 * *transition legality* is the core's concern, not this layer's.
 */
export function createTicketRepository(db: Database.Database): TicketRepository {
  const get = (id: string): Ticket | undefined => {
    const row = db.prepare("SELECT * FROM ticket WHERE id = ?").get(id) as TicketRow | undefined;
    return row ? rowToTicket(row) : undefined;
  };

  return {
    create({ title, description }) {
      if (typeof title !== "string" || title.trim() === "") {
        throw new Error("ticket title must be a non-empty string");
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO ticket (id, title, description, status, block_status)
         VALUES (?, ?, ?, 'created', 'none')`,
      ).run(id, title, description ?? "");
      return get(id)!;
    },

    get,

    list() {
      const rows = db
        .prepare("SELECT * FROM ticket ORDER BY created_at ASC, rowid ASC")
        .all() as TicketRow[];
      return rows.map(rowToTicket);
    },

    update(id, patch) {
      const existing = get(id);
      if (!existing) return undefined;
      const title = patch.title ?? existing.title;
      const description = patch.description ?? existing.description;
      db.prepare(
        `UPDATE ticket
         SET title = ?, description = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      ).run(title, description, id);
      return get(id);
    },

    setStatus(id, status, blockStatus) {
      if (!isTicketStatus(status)) {
        throw new Error(`invalid ticket status: ${String(status)}`);
      }
      if (blockStatus !== undefined && !isBlockStatus(blockStatus)) {
        throw new Error(`invalid block status: ${String(blockStatus)}`);
      }
      if (!get(id)) return undefined;
      if (blockStatus !== undefined) {
        db.prepare(
          `UPDATE ticket
           SET status = ?, block_status = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        ).run(status, blockStatus, id);
      } else {
        db.prepare(
          `UPDATE ticket
           SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        ).run(status, id);
      }
      return get(id);
    },
  };
}
