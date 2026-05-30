import { useCallback, useEffect, useState } from "react";
import { listTickets, type Ticket, type TicketStatus } from "../api/client";
import {
  BOARD_COLUMNS,
  COLUMN_HINTS,
  COLUMN_OWNER,
  columnOwnerLabel,
  ownerForTicket,
  phaseForTicket,
  statusLabel,
} from "./status";
import { TicketComposer } from "./TicketComposer";
import { Badge, Drawer, Pill, TicketCard } from "../ui";
import { statusTone } from "../design/tokens";
import { TicketDetail } from "./TicketDetail";
import * as css from "../app/App.css";

/** The Board view: lifecycle columns, quick-capture create flow, and (when a
 * card is selected) the ticket detail. View switching uses React state — no
 * router. */
export function Board() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The detail opens as a side drawer over the board, expandable to full screen.
  const [detailMode, setDetailMode] = useState<"side" | "full">("side");
  const [error, setError] = useState<string | null>(null);
  // The quick-capture composer is an on-demand affordance in the Created column.
  const [composing, setComposing] = useState(false);

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

  // ⌘. toggles the open detail between side and full (matches the reference).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setDetailMode((m) => (m === "side" ? "full" : "side"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const openComposer = () => setComposing(true);
  const openTicket = (id: string) => {
    setDetailMode("side");
    setSelectedId(id);
  };
  const closeTicket = () => setSelectedId(null);

  return (
    <div className={css.pageBody}>
      {error ? <p role="alert">{error}</p> : null}
      <div className={css.board} data-testid="board">
        {BOARD_COLUMNS.map((status) => {
          const column = tickets.filter((t) => t.status === status);
          const isCreated = status === "created";
          return (
            <section
              key={status}
              className={css.column}
              aria-label={statusLabel(status)}
            >
              <ColumnHeader
                status={status}
                count={column.length}
                onNewTicket={isCreated ? openComposer : undefined}
              />
              <div className={css.columnBody}>
                {isCreated && composing && (
                  <TicketComposer
                    onCreated={() => {
                      void refresh();
                    }}
                    onClose={() => setComposing(false)}
                  />
                )}
                {column.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    className={css.cardButton}
                    data-testid={`ticket-card-${ticket.id}`}
                    aria-label={ticket.title}
                    onClick={() => openTicket(ticket.id)}
                  >
                    <TicketCard
                      ticketKey={ticket.id}
                      title={ticket.title}
                      status={ticket.status}
                      owner={ownerForTicket(ticket.status, ticket.blockStatus)}
                      blockStatus={ticket.blockStatus}
                      blockReason={
                        ticket.blockStatus === "blocked" ? "Blocked" : undefined
                      }
                      phase={phaseForTicket(ticket.status, ticket.blockStatus)}
                    />
                  </button>
                ))}
                {isCreated && !composing && (
                  <button
                    type="button"
                    className={css.newTicketTrigger}
                    data-testid="board-new-ticket"
                    onClick={openComposer}
                  >
                    + New ticket
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Drawer
        open={!!selectedId}
        mode={detailMode}
        onClose={closeTicket}
        headerActions={
          <button
            type="button"
            className={css.newTicketIcon}
            aria-label={
              detailMode === "side"
                ? "Expand to full screen"
                : "Collapse to side panel"
            }
            title={detailMode === "side" ? "Expand (⌘.)" : "Collapse (⌘.)"}
            onClick={() =>
              setDetailMode((m) => (m === "side" ? "full" : "side"))
            }
          >
            {detailMode === "side" ? "⤢" : "⤡"}
          </button>
        }
      >
        {selectedId && (
          <TicketDetail
            ticketId={selectedId}
            onMutated={() => {
              void refresh();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/** Per-column header: status dot, label, count badge, and owner pill, with a
 * one-line muted hint underneath. The Created column also gets a ＋ trigger that
 * opens the quick-capture composer. Composed from existing primitives. */
function ColumnHeader({
  status,
  count,
  onNewTicket,
}: {
  status: TicketStatus;
  count: number;
  onNewTicket?: () => void;
}) {
  const owner = COLUMN_OWNER[status];
  return (
    <header className={css.columnHeader}>
      <div className={css.columnHeadRow}>
        <span
          className={css.columnDot}
          data-status-dot={status}
          aria-hidden
          style={{ background: statusTone[status].fg }}
        />
        <span className={css.columnTitleText}>{statusLabel(status)}</span>
        <Badge count={count} tone="neutral" />
        <span className={css.columnSpacer} />
        {onNewTicket && (
          <button
            type="button"
            className={css.newTicketIcon}
            data-testid="board-new-ticket-header"
            aria-label="New ticket"
            onClick={onNewTicket}
          >
            +
          </button>
        )}
        <Pill tone={`owner.${owner}`}>{columnOwnerLabel(owner)}</Pill>
      </div>
      <p className={css.columnHint}>{COLUMN_HINTS[status]}</p>
    </header>
  );
}
