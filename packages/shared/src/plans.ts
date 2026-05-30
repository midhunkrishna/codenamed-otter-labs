/**
 * Plan domain contract (MIN-22 / MIN-23, planning-loop).
 *
 * Frozen, orchestrator-owned. `@otter/persistence` and `@otter/core` import these
 * so the plan repository, the planning orchestrator, and the approval API agree on
 * the shape of plans and the planning-output contract without depending on each
 * other. `@otter/web` keeps its own local mirror (browser bundle stays node-free).
 */

/** The four plan statuses used going forward (legacy 'draft' rows are inert). */
export const PLAN_STATUSES = ["proposed", "approved", "sent_back", "superseded"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** A plan row, camelCase domain shape (DB columns are snake_case). */
export interface Plan {
  id: string;
  ticketId: string;
  runId: string | null;
  /** Per-ticket, 1-based, increments. */
  version: number;
  title: string;
  status: PlanStatus;
  /** Plan markdown of record. Immutable after creation. */
  content: string;
  /** Relative to data dir, when the artifact file has been written. */
  artifactPath: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Planning output contract (MIN-22) ---

/** Markers delimiting the machine-readable plan block in Claude's final message. */
export const PLAN_MARKER_START = "<<<OTTER_PLAN>>>";
export const PLAN_MARKER_END = "<<<OTTER_PLAN_END>>>";

export type PlanResultStatus = "PLAN_READY" | "PLAN_BLOCKED";

export interface PlanResultHeader {
  status: PlanResultStatus;
  title?: string;
}

/** Result of parsing Claude's planning output (never thrown — see `parsePlanResult`). */
export type ParsedPlanResult =
  | { kind: "ready"; title: string; markdown: string }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; raw: string }; // markers absent/malformed; raw preserved
