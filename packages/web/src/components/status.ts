import type { TicketStatus } from "../api/client";

/** The Board columns, in display order. EXACTLY per MIN-16: the 7 active
 * lifecycle states. `canceled`/`failed` are reachable via transitions but are
 * intentionally not rendered as columns. */
export const BOARD_COLUMNS: readonly TicketStatus[] = [
  "created",
  "plannable",
  "needs_user_approval",
  "executable",
  "in_progress",
  "needs_user_review",
  "done",
] as const;

/** Human labels for every lifecycle state (used by columns + buttons). */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: "Created",
  plannable: "Plannable",
  needs_user_approval: "Needs Approval",
  executable: "Executable",
  in_progress: "In Progress",
  needs_user_review: "Needs Review",
  done: "Done",
  canceled: "Canceled",
  failed: "Failed",
};

/** Label for a status, falling back to the raw value for safety. */
export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] ?? status;
}
