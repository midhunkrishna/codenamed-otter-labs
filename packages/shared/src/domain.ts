/**
 * Ticket-core domain contract (MIN-14 / MIN-15 / MIN-16).
 *
 * Frozen, orchestrator-owned. `@otter/persistence` and `@otter/core` import these
 * types and constants so they agree on the shape of tickets, comments and
 * lifecycle events without depending on each other's implementation. `@otter/web`
 * does NOT import this module — it keeps its own local mirror (browser bundle stays
 * node-free). Re-sync the web mirror via the channel log if this contract changes.
 *
 * Validity rules live in two places by design:
 *  - "is this a valid *status value*"   → persistence (uses {@link TICKET_STATUSES}).
 *  - "is this a valid *status transition*" → core state machine (MIN-15 authority).
 */

/** The nine lifecycle states a ticket can occupy (MIN-15). Order is display order. */
export const TICKET_STATUSES = [
  "created",
  "plannable",
  "needs_user_approval",
  "executable",
  "in_progress",
  "needs_user_review",
  "done",
  "canceled",
  "failed",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Block status. MVP tracks only blocked / not-blocked. */
export const BLOCK_STATUSES = ["none", "blocked"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

/** A freshly created ticket starts here (MIN-14 example). */
export const INITIAL_TICKET_STATUS: TicketStatus = "created";
export const INITIAL_BLOCK_STATUS: BlockStatus = "none";

/** True when `value` is a member of {@link TICKET_STATUSES}. */
export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

/** True when `value` is a member of {@link BLOCK_STATUSES}. */
export function isBlockStatus(value: unknown): value is BlockStatus {
  return typeof value === "string" && (BLOCK_STATUSES as readonly string[]).includes(value);
}

/** A ticket row, mapped to camelCase domain shape (DB columns are snake_case). */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  blockStatus: BlockStatus;
  /** ISO-8601 UTC string. */
  createdAt: string;
  /** ISO-8601 UTC string; bumped on every mutation incl. transitions. */
  updatedAt: string;
}

/** A comment row. Append-only in MVP (no edit/delete). */
export interface Comment {
  id: string;
  ticketId: string;
  author: string;
  /** Non-empty (MIN-14 invariant). */
  body: string;
  /** Arbitrary JSON object; persisted as a JSON string, must parse (MIN-14 invariant). */
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** A recorded lifecycle transition (MIN-15: one event per transition). */
export interface TicketEvent {
  id: string;
  ticketId: string;
  /** Null only for the synthetic creation event, if any; otherwise the prior status. */
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  /** Human/machine-readable note about the transition. */
  detail: string;
  createdAt: string;
}
