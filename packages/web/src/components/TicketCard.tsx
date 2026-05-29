import type { Ticket } from "../api/client";
import { statusLabel } from "./status";

interface TicketCardProps {
  ticket: Ticket;
  onSelect(id: string): void;
}

/** A single ticket on the Board. Clicking it opens the detail view. */
export function TicketCard({ ticket, onSelect }: TicketCardProps) {
  return (
    <button
      type="button"
      className="ticket-card"
      data-testid={`ticket-card-${ticket.id}`}
      onClick={() => onSelect(ticket.id)}
    >
      <span className="ticket-card__title">{ticket.title}</span>
      {ticket.blockStatus === "blocked" ? (
        <span className="ticket-card__block" aria-label="blocked">
          blocked
        </span>
      ) : null}
      <span className="ticket-card__status">{statusLabel(ticket.status)}</span>
    </button>
  );
}
