import type { RunStatus, RunType } from "../api/runs";
import type { ToneSelector } from "../ui";

/**
 * Presentation helpers for agent-run lifecycle (MIN-32). Run statuses reuse the
 * design system's existing `status.*` tones (no new tokens) so the Runs console
 * is colour-consistent with the Board. No raw colours here — only tone
 * selectors, resolved by the Pill/Badge primitives.
 */

/** Display order for status groups: active/waiting first, terminal last. */
export const RUN_STATUS_ORDER: readonly RunStatus[] = [
  "running",
  "waiting_on_permission",
  "waiting_on_user_input",
  "queued",
  "completed",
  "failed",
  "canceled",
] as const;

/** Human labels for every run status. */
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_on_permission: "Waiting on permission",
  waiting_on_user_input: "Waiting on you",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

export function runStatusLabel(status: RunStatus): string {
  return RUN_STATUS_LABELS[status] ?? status;
}

/** Run status → an existing design-system tone selector. */
export const RUN_STATUS_TONE: Record<RunStatus, ToneSelector> = {
  queued: "status.created",
  running: "status.in_progress",
  waiting_on_permission: "status.needs_user_approval",
  waiting_on_user_input: "status.needs_user_review",
  completed: "status.done",
  failed: "status.failed",
  canceled: "status.canceled",
};

export function runStatusTone(status: RunStatus): ToneSelector {
  return RUN_STATUS_TONE[status] ?? "neutral";
}

/** Human labels for run types. */
export const RUN_TYPE_LABELS: Record<RunType, string> = {
  planning: "Planning",
  execution: "Execution",
  manual: "Manual",
  review: "Review",
};

export function runTypeLabel(type: RunType): string {
  return RUN_TYPE_LABELS[type] ?? type;
}

/** Human labels for run-event kinds (used in the timeline). */
export const RUN_EVENT_LABELS: Record<string, string> = {
  status_changed: "Status changed",
  output_delta: "Output",
  log: "Log",
  permission_requested: "Permission requested",
  user_input_requested: "Input requested",
  note: "Note",
};

export function runEventLabel(kind: string): string {
  return RUN_EVENT_LABELS[kind] ?? kind;
}
