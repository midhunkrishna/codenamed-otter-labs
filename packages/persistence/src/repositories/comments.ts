import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Comment } from "@otter/shared";

/** Raw snake_case comment row as stored in SQLite. */
interface CommentRow {
  id: string;
  ticket_id: string;
  author: string;
  body: string;
  metadata: string;
  created_at: string;
}

/** Map a snake_case DB row to the camelCase {@link Comment} domain object. */
function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    author: row.author,
    body: row.body,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface CommentRepository {
  create(
    ticketId: string,
    input: { body: string; author?: string; metadata?: Record<string, unknown> },
  ): Comment;
  listByTicket(ticketId: string): Comment[];
}

/**
 * Append-only comment persistence. Enforces a non-empty body and a plain
 * JSON-object metadata (serialized to a string column), and returns comments
 * oldest-first. metadata defaults to `{}`.
 */
export function createCommentRepository(db: Database.Database): CommentRepository {
  return {
    create(ticketId, { body, author, metadata }) {
      if (typeof body !== "string" || body.trim() === "") {
        throw new Error("comment body must be a non-empty string");
      }
      const meta = metadata === undefined ? {} : metadata;
      if (!isPlainObject(meta)) {
        throw new Error("comment metadata must be a plain JSON object");
      }
      let metaJson: string;
      try {
        metaJson = JSON.stringify(meta);
      } catch (cause) {
        throw new Error("comment metadata must be JSON-serializable", { cause });
      }
      // JSON.stringify can yield undefined for non-serializable inputs; guard it.
      if (metaJson === undefined) {
        throw new Error("comment metadata must be JSON-serializable");
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO comment (id, ticket_id, author, body, metadata)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, ticketId, author ?? "", body, metaJson);
      const row = db.prepare("SELECT * FROM comment WHERE id = ?").get(id) as CommentRow;
      return rowToComment(row);
    },

    listByTicket(ticketId) {
      const rows = db
        .prepare("SELECT * FROM comment WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC")
        .all(ticketId) as CommentRow[];
      return rows.map(rowToComment);
    },
  };
}
