import { useCallback, useEffect, useState } from "react";
import { listTickets, type Ticket } from "../api/client";
import { BOARD_COLUMNS, statusLabel } from "./status";
import { CreateTicketForm } from "./CreateTicketForm";
import { TicketCard } from "./TicketCard";
import { TicketDetail } from "./TicketDetail";

/** The Board view: lifecycle columns, create-ticket flow, and (when a card is
 * selected) the ticket detail. View switching uses React state — no router. */
export function Board() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setTickets(await listTickets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (selectedId) {
    return (
      <TicketDetail
        ticketId={selectedId}
        onClose={() => setSelectedId(null)}
        onMutated={() => {
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="board-view">
      <CreateTicketForm
        onCreated={() => {
          void refresh();
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      <div className="board" data-testid="board">
        {BOARD_COLUMNS.map((status) => {
          const column = tickets.filter((t) => t.status === status);
          return (
            <section
              key={status}
              className="board__column"
              aria-label={statusLabel(status)}
            >
              <h3>{statusLabel(status)}</h3>
              {column.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onSelect={setSelectedId}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
