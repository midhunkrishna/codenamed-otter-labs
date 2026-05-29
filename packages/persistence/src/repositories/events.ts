import type Database from "better-sqlite3";
import type { TicketEvent, TicketStatus } from "@otter/shared";

/** Raw snake_case ticket_event row as stored in SQLite. */
export interface TicketEventRow {
  id: string;
  ticket_id: string;
  from_status: string | null;
  to_status: string;
  detail: string;
  created_at: string;
}

/** Map a snake_case DB row to the camelCase {@link TicketEvent} domain object. */
export function rowToTicketEvent(row: TicketEventRow): TicketEvent {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    fromStatus: row.from_status as TicketStatus | null,
    toStatus: row.to_status as TicketStatus,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export interface TicketEventRepository {
  listByTicket(ticketId: string): TicketEvent[];
}

/** Read-only access to recorded lifecycle events, oldest-first. */
export function createTicketEventRepository(db: Database.Database): TicketEventRepository {
  return {
    listByTicket(ticketId) {
      const rows = db
        .prepare(
          "SELECT * FROM ticket_event WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC",
        )
        .all(ticketId) as TicketEventRow[];
      return rows.map(rowToTicketEvent);
    },
  };
}
