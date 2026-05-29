import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Ticket, TicketEvent, TicketStatus } from "@otter/shared";
import { createTicketRepository } from "./tickets.js";
import { rowToTicketEvent, type TicketEventRow } from "./events.js";

export interface ApplyTransitionInput {
  ticketId: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  detail: string;
}

export interface ApplyTransitionResult {
  ticket: Ticket;
  event: TicketEvent;
}

/**
 * Atomically apply a lifecycle transition: set the ticket's status (and bump
 * `updated_at`) AND insert exactly one `ticket_event` row, in a single
 * better-sqlite3 transaction. Throws (rolling back both writes) if the ticket
 * does not exist.
 *
 * This is the seam the core calls: persistence guarantees atomicity, the core
 * decides whether a transition is allowed (MIN-15). `toStatus` is validated as
 * a status *value* here; transition *legality* is not checked.
 */
export function applyTransition(
  db: Database.Database,
  { ticketId, fromStatus, toStatus, detail }: ApplyTransitionInput,
): ApplyTransitionResult {
  const tickets = createTicketRepository(db);

  const run = db.transaction((): ApplyTransitionResult => {
    const ticket = tickets.setStatus(ticketId, toStatus);
    if (!ticket) {
      throw new Error(`cannot transition unknown ticket: ${ticketId}`);
    }
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO ticket_event (id, ticket_id, from_status, to_status, detail)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(eventId, ticketId, fromStatus, toStatus, detail);
    const eventRow = db
      .prepare("SELECT * FROM ticket_event WHERE id = ?")
      .get(eventId) as TicketEventRow;
    return { ticket, event: rowToTicketEvent(eventRow) };
  });

  return run();
}
