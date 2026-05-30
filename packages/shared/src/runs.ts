/**
 * Agent-run domain contract (MIN-19 / MIN-45 / MIN-32, runtime-foundations).
 *
 * Frozen, orchestrator-owned. `@otter/persistence` and `@otter/core` import these
 * so the run repository, the runs API, the event bus, and the readiness guard all
 * agree on the shape of runs and run events without depending on each other.
 * `@otter/web` keeps its own local mirror (browser bundle stays node-free) — re-sync
 * via the channel log if this contract changes.
 */

/** The stable id of the bootstrapped default local project (MIN-45). */
export const DEFAULT_PROJECT_ID = "local-project";

/** A local project (MIN-45). MVP has exactly one (the seeded default), but the
 * schema/types do not forbid more. */
export interface Project {
  id: string;
  name: string;
  /** Absolute project root (the repo Otter runs in). */
  root: string;
  /** Absolute `.otter-labs` data directory. */
  dataDir: string;
  createdAt: string;
  updatedAt: string;
}

/** The four kinds of agent run (MIN-19). */
export const RUN_TYPES = ["planning", "execution", "manual", "review"] as const;
export type RunType = (typeof RUN_TYPES)[number];

/** The seven run lifecycle statuses (MIN-19). */
export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_on_permission",
  "waiting_on_user_input",
  "completed",
  "failed",
  "canceled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Terminal statuses — a run in one of these cannot be canceled (MIN-19). */
export const TERMINAL_RUN_STATUSES = ["completed", "failed", "canceled"] as const;
export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

/** True when `value` is a member of {@link RUN_TYPES}. */
export function isRunType(value: unknown): value is RunType {
  return typeof value === "string" && (RUN_TYPES as readonly string[]).includes(value);
}

/** True when `value` is a member of {@link RUN_STATUSES}. */
export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

/** True when a run in `status` is terminal (cannot transition / cannot cancel). */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

/** An agent run row, camelCase domain shape (DB columns are snake_case). */
export interface AgentRun {
  id: string;
  /** Owning project (MIN-45 invariant: every run belongs to a project). */
  projectId: string;
  /** Optional — null for non-ticket runs (MIN-19 invariant). */
  ticketId: string | null;
  type: RunType;
  status: RunStatus;
  /** Short human label for the run. */
  title: string;
  createdAt: string;
  /** Bumped on every status change (MIN-19 invariant). */
  updatedAt: string;
  /** ISO-8601 when the run entered `running`; null until then. */
  startedAt: string | null;
  /** ISO-8601 when the run reached a terminal status; null until then. */
  finishedAt: string | null;
}

/** The kinds of append-only event a run can record (MIN-19 / MIN-44 seam). */
export const RUN_EVENT_KINDS = [
  "status_changed",
  "output_delta",
  "log",
  "permission_requested",
  "user_input_requested",
  "note",
] as const;
export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

/** An append-only run event (MIN-19). `seq` is a per-run monotonic counter so the
 * UI can replay output in order and reconcile after reconnect. */
export interface AgentRunEvent {
  id: string;
  runId: string;
  /** Per-run monotonic sequence (1-based), assigned on append. */
  seq: number;
  kind: RunEventKind;
  /** Arbitrary JSON object; persisted as a JSON string, must parse. */
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Filter for listing runs (MIN-19 `list runs by project`). */
export interface RunListFilter {
  projectId?: string;
  ticketId?: string;
  status?: RunStatus;
}
