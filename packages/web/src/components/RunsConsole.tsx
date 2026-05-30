import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listRuns, type AgentRun, type RunStatus } from "../api/runs";
import {
  connectEvents,
  CHANNELS,
  type EventEnvelope,
  type EventsClient,
} from "../ws/events";
import { RUN_STATUS_ORDER, runStatusLabel, runStatusTone, runTypeLabel } from "./runStatus";
import { RunDetail } from "./RunDetail";
import { Badge, Drawer, EmptyState, PageHeader, Pill, SectionHeader } from "../ui";
import * as appCss from "../app/App.css";
import * as css from "./RunsConsole.css";

/**
 * Agent Runs console (MIN-32). Lists runs grouped by status (active/waiting
 * groups on top), and opens a run detail in a side Drawer. Recovery-first: the
 * list is loaded over HTTP on mount/refresh, THEN we subscribe to the `project`
 * channel for live `run_created` / `run_status_changed` deltas so new runs
 * appear and statuses update without a manual refresh. A single shared
 * live-events client is owned here and handed to the open RunDetail.
 *
 * Scroll/focus is UI-owned; the events client only delivers data.
 */
export function RunsConsole() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One shared live-events socket for the console + the open detail. Created
  // once and torn down on unmount.
  const eventsRef = useRef<EventsClient | null>(null);
  if (eventsRef.current === null) {
    eventsRef.current = connectEvents();
  }
  const events = eventsRef.current;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setRuns(await listRuns());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    }
  }, []);

  // Recovery: HTTP load first.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Then go live on the project channel for run lifecycle deltas.
  useEffect(() => {
    const handler = (env: EventEnvelope) => {
      if (env.type === "run_created" || env.type === "run_status_changed") {
        // The envelope carries enough to patch optimistically, but the simplest
        // correct path (persist-before-broadcast is law) is to refetch the
        // authoritative newest-first list.
        void refresh();
      }
    };
    const off = events.subscribe(CHANNELS.project, handler);
    return off;
  }, [events, refresh]);

  // Tear down the shared socket when the console unmounts.
  useEffect(() => {
    return () => {
      eventsRef.current?.close();
      eventsRef.current = null;
    };
  }, []);

  // Group runs by status in the canonical display order; drop empty groups.
  const groups = useMemo(() => {
    const byStatus = new Map<RunStatus, AgentRun[]>();
    for (const run of runs) {
      const bucket = byStatus.get(run.status) ?? [];
      bucket.push(run);
      byStatus.set(run.status, bucket);
    }
    return RUN_STATUS_ORDER.map((status) => ({
      status,
      items: byStatus.get(status) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [runs]);

  return (
    <div className={appCss.pageBody}>
      <PageHeader
        eyebrow="Runtime"
        title="Agent Runs"
        description="Live console for agent runs — grouped by status, with full output recovery."
      />

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Agent runs will appear here as they are created."
        />
      ) : (
        <div className={css.list} data-testid="runs-list">
          {groups.map((group) => (
            <section
              key={group.status}
              className={css.group}
              aria-label={runStatusLabel(group.status)}
            >
              <SectionHeader
                title={
                  <span className={css.groupHead}>
                    <Pill tone={runStatusTone(group.status)}>
                      {runStatusLabel(group.status)}
                    </Pill>
                    <Badge count={group.items.length} tone="neutral" />
                  </span>
                }
              />
              <div className={css.groupItems}>
                {group.items.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={css.runRow}
                    data-testid={`run-row-${run.id}`}
                    aria-label={run.title || run.id}
                    onClick={() => setSelectedId(run.id)}
                  >
                    <span className={css.runRowMain}>
                      <span className={css.runRowTitle}>
                        {run.title || runTypeLabel(run.type)}
                      </span>
                      <span className={css.runRowMeta}>
                        <Pill tone="neutral">{runTypeLabel(run.type)}</Pill>
                        {run.ticketId ? <span>ticket {run.ticketId}</span> : null}
                        <span>{run.createdAt}</span>
                      </span>
                    </span>
                    <Pill tone={runStatusTone(run.status)}>
                      {runStatusLabel(run.status)}
                    </Pill>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer open={!!selectedId} onClose={() => setSelectedId(null)}>
        {selectedId ? (
          <RunDetail
            runId={selectedId}
            events={events}
            onMutated={() => {
              void refresh();
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
