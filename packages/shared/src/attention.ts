/**
 * Attention-item domain contract (MIN-23, planning-loop).
 *
 * Frozen, orchestrator-owned. The attention repository, the approval API, and the
 * orchestrator agree on this shape. `@otter/web` keeps its own local mirror (browser
 * bundle stays node-free).
 */

/** The kinds of attention item. MVP: only plan approval; schema generalizes. */
export const ATTENTION_KINDS = ["plan_approval"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** Attention lifecycle: open until resolved. */
export const ATTENTION_STATUSES = ["open", "resolved"] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

/** An attention-queue row, camelCase domain shape (DB columns are snake_case). */
export interface AttentionItem {
  id: string;
  ticketId: string | null;
  kind: AttentionKind;
  status: AttentionStatus;
  /** e.g. the plan id awaiting a decision. */
  refId: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}
