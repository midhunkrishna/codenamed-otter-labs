import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelRun,
  getRun,
  getRunEvents,
  isTerminalRun,
  isWaitingRun,
  type AgentRun,
  type AgentRunEvent,
  type RunStatus,
} from "../api/runs";
import {
  CHANNELS,
  type EventEnvelope,
  type EventsClient,
} from "../ws/events";
import { runEventLabel, runStatusLabel, runStatusTone, runTypeLabel } from "./runStatus";
import { Button, CodeBlock, MetadataRow, PageHeader, Pill, SectionHeader } from "../ui";
import * as css from "./RunsConsole.css";

interface RunDetailProps {
  runId: string;
  /** Live-events client, owned by the parent console (shared socket). */
  events: EventsClient;
  /** Called after a mutation (e.g. cancel) so the parent list can refetch. */
  onMutated(): void;
}

/** Extract the raw output text from an `output_delta` event payload. The backend
 * carries it under `text` (plan §3a "Live output"); fall back to `delta`/`output`
 * for resilience, else "". */
function deltaText(payload: Record<string, unknown>): string {
  const candidate = payload.text ?? payload.delta ?? payload.output;
  return typeof candidate === "string" ? candidate : "";
}

/** A human-friendly one-line summary for a timeline event. */
function timelineSummary(ev: AgentRunEvent): string {
  const p = ev.payload;
  if (typeof p.message === "string") return p.message;
  if (ev.kind === "status_changed" && typeof p.status === "string") {
    return `→ ${runStatusLabel(p.status as RunStatus)}`;
  }
  if (ev.kind === "output_delta") return deltaText(p);
  return "";
}

/**
 * Run detail (MIN-32). Recovers fully from persisted state over HTTP on mount —
 * the run + its full event history — THEN subscribes to the live `run:<id>`
 * channel for deltas: appends `output_delta` text to the shown output and
 * applies `run_status_changed` to the status. Renders the live output via the
 * CodeBlock primitive (raw, never paraphrased), a chronological event timeline,
 * the linked ticket, waiting-state callouts, and a cancel action.
 *
 * This component owns its own scroll: the events client only delivers data.
 */
export function RunDetail({ runId, events, onMutated }: RunDetailProps) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [eventList, setEventList] = useState<AgentRunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  // Output the user scrolls; we own scroll behaviour (events client never does).
  const outputRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Recovery: hydrate the full persisted state before going live.
      const [r, evs] = await Promise.all([getRun(runId), getRunEvents(runId)]);
      setRun(r);
      setEventList(evs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Subscribe to live deltas for this run AFTER the initial HTTP load is wired.
  // We always (re)subscribe on runId change. The handler dedupes by the PERSISTED
  // event id (`payload.id`) — the only stable key shared with HTTP-loaded history.
  // The envelope's bus `seq` is a global counter and must NOT be used for dedupe
  // (it never matches the per-run agent_run_event.seq). A delta without `id` cannot
  // be deduped, so we drop it and let HTTP recovery (on the next status change /
  // refresh) surface it — never double-count.
  useEffect(() => {
    const channel = CHANNELS.run(runId);
    const handler = (env: EventEnvelope) => {
      if (env.type === "run_output_delta") {
        const id = typeof env.payload.id === "string" ? env.payload.id : null;
        if (id === null) return; // unkeyed delta: recover via HTTP, don't risk a dupe
        const seq = typeof env.payload.seq === "number" ? env.payload.seq : 0;
        const ev: AgentRunEvent = {
          id,
          runId,
          seq,
          kind: "output_delta",
          payload: env.payload,
          createdAt: env.ts,
        };
        setEventList((prev) => (prev.some((e) => e.id === ev.id) ? prev : [...prev, ev]));
      } else if (env.type === "run_status_changed") {
        const status = env.payload.status;
        if (typeof status === "string") {
          setRun((prev) =>
            prev ? { ...prev, status: status as RunStatus } : prev,
          );
        }
        // Pull in the authoritative run + any new event rows behind this change.
        void load();
      }
    };
    const off = events.subscribe(channel, handler);
    return off;
  }, [runId, events, load]);

  // Auto-scroll the live output to the bottom as deltas arrive (UI-owned).
  // Order by per-run seq so live deltas arriving out of order (or before an HTTP
  // reload) still concatenate in the correct sequence.
  const outputText = eventList
    .filter((e) => e.kind === "output_delta")
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((e) => deltaText(e.payload))
    .join("");
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputText]);

  async function handleCancel() {
    if (!run) return;
    setError(null);
    setCanceling(true);
    try {
      const updated = await cancelRun(run.id);
      setRun(updated);
      await load();
      onMutated();
    } catch (err) {
      // 409 (terminal) surfaces the backend's `{error}` message verbatim.
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCanceling(false);
    }
  }

  if (!run) {
    return (
      <section className={css.detail} aria-label="Run detail">
        {error ? (
          <p role="alert" className={css.errorText}>
            {error}
          </p>
        ) : (
          <p className={css.muted}>Loading…</p>
        )}
      </section>
    );
  }

  const terminal = isTerminalRun(run.status);
  const waiting = isWaitingRun(run.status);

  return (
    <section className={css.detail} aria-label="Run detail">
      <PageHeader
        eyebrow={run.id}
        title={run.title || runTypeLabel(run.type)}
        description={
          <span className={css.pillRow}>
            <Pill tone={runStatusTone(run.status)}>{runStatusLabel(run.status)}</Pill>
            <Pill tone="neutral">{runTypeLabel(run.type)}</Pill>
          </span>
        }
        actions={
          <Button
            variant="danger"
            disabled={terminal || canceling}
            onClick={handleCancel}
            aria-label="Cancel run"
          >
            {canceling ? "Canceling…" : "Cancel run"}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      {waiting ? (
        <div
          className={css.waitingBanner}
          role="status"
          data-testid="run-waiting"
          data-waiting={run.status}
        >
          <div className={css.waitingHead}>
            <Pill tone={runStatusTone(run.status)}>{runStatusLabel(run.status)}</Pill>
          </div>
          <p className={css.waitingMessage}>
            {run.status === "waiting_on_permission"
              ? "This run is paused waiting for permission to proceed."
              : "This run is paused waiting on your input."}
          </p>
        </div>
      ) : null}

      <section className={css.detailSection} aria-label="Run facts">
        <MetadataRow
          columns={2}
          items={[
            { label: "Type", value: runTypeLabel(run.type) },
            { label: "Status", value: runStatusLabel(run.status) },
            {
              label: "Ticket",
              value: run.ticketId ? (
                <CodeBlock inline code={run.ticketId} />
              ) : (
                "—"
              ),
            },
            { label: "Created", value: run.createdAt },
            { label: "Started", value: run.startedAt ?? "—" },
            { label: "Finished", value: run.finishedAt ?? "—" },
          ]}
        />
      </section>

      <section className={css.detailSection} aria-label="Output">
        <SectionHeader title="Output" tag="live" />
        <div ref={outputRef} data-testid="run-output">
          {outputText ? (
            <CodeBlock code={outputText} />
          ) : (
            <p className={css.muted}>No output yet.</p>
          )}
        </div>
      </section>

      <section className={css.detailSection} aria-label="Timeline">
        <SectionHeader title="Timeline" />
        {eventList.length > 0 ? (
          <ul className={css.timeline} data-testid="run-timeline">
            {eventList.map((ev) => (
              <li key={ev.id} className={css.timelineItem} data-kind={ev.kind}>
                <div className={css.timelineHead}>
                  <span className={css.timelineKind}>{runEventLabel(ev.kind)}</span>
                  <span className={css.timelineTime}>{ev.createdAt}</span>
                </div>
                {timelineSummary(ev) ? (
                  <p className={css.timelineBody}>{timelineSummary(ev)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={css.muted}>No events yet.</p>
        )}
      </section>
    </section>
  );
}
