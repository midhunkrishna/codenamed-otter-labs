import type { BlockStatus, TicketStatus } from "../api/client";
import type { Owner } from "../ui";

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

/**
 * Derive a ticket's design-system `Owner` from its lifecycle status + block
 * guard. The domain `Ticket` has no owner field, so we map it here for the
 * card's owner stripe, the phase chip, and the column-header pill.
 *
 * Semantics: "who is the actor for the work in this phase", not "who must
 * push the ticket out of this state". This matches the board reference image
 * — Plannable / Executable / In Progress are agent phases; Created /
 * Needs Approval / Needs Review are user phases.
 *
 *  - `blocked` block guard → "blocked" (amber), regardless of status.
 *  - `created` / `needs_user_approval` / `needs_user_review` → "user".
 *  - `plannable` / `executable` / `in_progress` → "agent".
 *  - `done` / `canceled` / `failed` → "system".
 */
const STATUS_OWNER: Record<TicketStatus, Owner> = {
  created: "user",
  plannable: "agent",
  needs_user_approval: "user",
  needs_user_review: "user",
  executable: "agent",
  in_progress: "agent",
  done: "system",
  canceled: "system",
  failed: "system",
};

export function ownerForTicket(
  status: TicketStatus,
  blockStatus: BlockStatus,
): Owner {
  if (blockStatus === "blocked") return "blocked";
  return STATUS_OWNER[status] ?? "system";
}

/** Phase chip label per status (when not blocked). */
const STATUS_PHASE_LABEL: Record<TicketStatus, string> = {
  created: "YOUR TURN",
  plannable: "AGENT QUEUED",
  needs_user_approval: "YOUR TURN",
  executable: "AGENT QUEUED",
  in_progress: "RUNNING",
  needs_user_review: "YOUR TURN",
  done: "DONE",
  canceled: "CANCELED",
  failed: "FAILED",
};

/**
 * Derive the `TicketCard` phase chip from `status + blockStatus`. Blocked
 * tickets always read as "CLARIFICATION NEEDED" with the amber/blocked owner —
 * the chip is the same color cue as the amber block stripe.
 */
export function phaseForTicket(
  status: TicketStatus,
  blockStatus: BlockStatus,
): { owner: Owner; label: string } {
  if (blockStatus === "blocked") {
    return { owner: "blocked", label: "CLARIFICATION NEEDED" };
  }
  return {
    owner: STATUS_OWNER[status] ?? "system",
    label: STATUS_PHASE_LABEL[status] ?? "",
  };
}

/** One-line subtitle shown under each Board column header. */
export const COLUMN_HINTS: Record<TicketStatus, string> = {
  created: "Drafted by you",
  plannable: "Ready for agent planning",
  needs_user_approval: "Plan awaiting your sign-off",
  executable: "Approved — pick an execution mode",
  in_progress: "Agent is working",
  needs_user_review: "Awaiting your review",
  done: "Shipped",
  canceled: "Stopped before completion",
  failed: "Run failed",
};

/** Which actor "owns" the work in a given column (drives the header pill). */
export const COLUMN_OWNER: Record<TicketStatus, Owner> = STATUS_OWNER;

/** Display label for the column-header owner pill (YOU / AGENT / SYSTEM). */
export function columnOwnerLabel(owner: Owner): string {
  if (owner === "user") return "YOU";
  if (owner === "agent") return "AGENT";
  if (owner === "blocked") return "BLOCKED";
  return "SYSTEM";
}
