import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listAttention,
  type AttentionItemVM,
  type AttentionType,
} from "../api/attention";
import { AttentionItemCard, Badge, EmptyState, PageHeader } from "../ui";
import {
  connectEvents,
  CHANNELS,
  type EventEnvelope,
  type EventsClient,
} from "../ws/events";
import * as appCss from "../app/App.css";
import * as css from "./AttentionPage.css";

/**
 * Attention page (MIN-37): the unified user action queue. A sibling filter row
 * (All / Permissions / Plans / Questions / Verification / Failures) — each with
 * a live count badge — sits above the live queue of `AttentionItemCard`s.
 *
 * Recovery-first: HTTP `listAttention('open')` on mount, THEN subscribe to the
 * `attention` channel and refetch on `attention_item_{created,resolved,updated}`
 * so new items appear live. The events client only delivers data; scroll/focus
 * is UI-owned (events.ts NON-responsibility).
 *
 * Queue stability: the currently-expanded card's id is tracked in state. A live
 * refetch swaps the items array but never resets that id, so the focused card
 * does NOT collapse, move, or scroll when new items arrive — new items append.
 *
 * Unknown `attentionType` is handled INSIDE the card (generic fallback, Impl-D);
 * the page passes every item through unchanged.
 */

/** A sibling filter and the `attention_type`(s) it matches (plan §1.6). */
interface FilterDef {
  id: string;
  label: string;
  /** `null` = match everything (the "All" filter). */
  types: AttentionType[] | null;
}

/** The "All" filter — also the fallback when an unknown filter id is active. */
const ALL_FILTER: FilterDef = { id: "all", label: "All", types: null };

const FILTERS: readonly FilterDef[] = [
  ALL_FILTER,
  { id: "permissions", label: "Permissions", types: ["permission_request"] },
  { id: "plans", label: "Plans", types: ["plan_approval"] },
  { id: "questions", label: "Questions", types: ["clarification_required"] },
  {
    id: "verification",
    label: "Verification",
    types: ["verification_review"],
  },
  // Failures = execution_failed ∪ run_stalled (plan §1.6).
  { id: "failures", label: "Failures", types: ["execution_failed", "run_stalled"] },
] as const;

/** True when `item` belongs to filter `f` (All matches everything). */
function matchesFilter(item: AttentionItemVM, f: FilterDef): boolean {
  return f.types === null || f.types.includes(item.attentionType);
}

export function AttentionPage() {
  const [items, setItems] = useState<AttentionItemVM[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  // Queue stability: the id of the currently-expanded card. A live refetch must
  // NOT disturb this — new items append, the focused card stays put.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One shared live-events socket, created once and torn down on unmount.
  const eventsRef = useRef<EventsClient | null>(null);
  if (eventsRef.current === null) {
    eventsRef.current = connectEvents();
  }
  const events = eventsRef.current;

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

  // Recovery: HTTP load first.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Then go live on the attention channel for queue deltas. Refetching the
  // authoritative newest-first list is the simplest correct path; the expanded
  // id is preserved across the swap (queue stability).
  useEffect(() => {
    const handler = (env: EventEnvelope) => {
      if (
        env.type === "attention_item_created" ||
        env.type === "attention_item_resolved" ||
        env.type === "attention_item_updated"
      ) {
        void refresh();
      }
    };
    const off = events.subscribe(CHANNELS.attention, handler);
    return off;
  }, [events, refresh]);

  // Tear down the shared socket on unmount.
  useEffect(() => {
    return () => {
      eventsRef.current?.close();
      eventsRef.current = null;
    };
  }, []);

  // Per-filter live counts for the badges (computed over the full item set).
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of FILTERS) {
      map[f.id] = items.filter((it) => matchesFilter(it, f)).length;
    }
    return map;
  }, [items]);

  const current = FILTERS.find((f) => f.id === activeFilter) ?? ALL_FILTER;
  const visible = useMemo(
    () => items.filter((it) => matchesFilter(it, current)),
    [items, current],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className={appCss.pageBody}>
      <PageHeader
        eyebrow="Workspace"
        title="Attention"
        description="The unified queue of items awaiting your decision — filtered by what they need from you."
      />

      <div className={css.filterRow} role="tablist" aria-label="Attention filters">
        {FILTERS.map((f) => {
          const isActive = f.id === current.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={[css.filter, isActive ? css.filterActive : ""]
                .filter(Boolean)
                .join(" ")}
              data-testid={`attention-filter-${f.id}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
              <Badge count={counts[f.id] ?? 0} tone={isActive ? "accent" : "neutral"} />
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing needs your attention"
          description="Items needing a human decision will appear here as they arrive."
        />
      ) : (
        <div className={css.list} data-testid="attention-list">
          {visible.map((item) => (
            <AttentionItemCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => toggleExpand(item.id)}
              onResolved={() => {
                void refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
