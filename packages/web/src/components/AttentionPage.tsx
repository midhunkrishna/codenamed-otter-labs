import { useCallback, useEffect, useState } from "react";
import { listAttention, type AttentionItem } from "../api/attention";
import { Drawer, EmptyState, PageHeader } from "../ui";
import { AttentionCard } from "../ui";
import { TicketDetail } from "./TicketDetail";
import * as appCss from "../app/App.css";
import * as css from "./RunsConsole.css";

/**
 * Attention page (MIN-23). Lists the OPEN attention items (newest first) using
 * the `AttentionCard` primitive. Clicking an item opens its ticket in a side
 * Drawer (reusing the Board's TicketDetail), where the plan approval can be
 * resolved — satisfying "user can discover and resolve plan approval from
 * Attention". Recovery-first: HTTP load on mount, refetch after a mutation.
 */
export function AttentionPage() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await listAttention("open"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load attention items",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className={appCss.pageBody}>
      <PageHeader
        eyebrow="Workspace"
        title="Attention"
        description="Items awaiting your decision — approve or send back a plan to keep the loop moving."
      />

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing needs your attention"
          description="Plan approvals and other items needing a human decision will appear here."
        />
      ) : (
        <div className={css.list} data-testid="attention-list">
          {items.map((item) => (
            <AttentionCard
              key={item.id}
              type="plan"
              priority="high"
              title="Plan awaiting approval"
              summary={item.detail || "A plan is ready for your decision."}
              requiredAction="Open the ticket to approve or send back the plan."
              ticketKey={item.ticketId ?? undefined}
              onClick={
                item.ticketId
                  ? () => setSelectedTicketId(item.ticketId)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <Drawer
        open={!!selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      >
        {selectedTicketId ? (
          <TicketDetail
            ticketId={selectedTicketId}
            onMutated={() => {
              void refresh();
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
