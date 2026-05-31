/**
 * Attention-item domain contract (MIN-36 — the unified user action queue).
 *
 * Frozen, orchestrator-owned (plan 007 §1.1). The attention repository, the
 * attention API, and the orchestrator agree on this shape. `@otter/web` keeps its
 * own local mirror so the browser bundle stays node-free.
 *
 * The attention queue is NOT a source of truth: the source object (a plan, a
 * permission request, a form, ...) remains authoritative. An attention item just
 * surfaces that source in the user's action queue.
 */

/** Canonical attention kinds (drives per-type UI rendering and filtering). */
export const ATTENTION_TYPES = [
  "permission_request",
  "plan_approval",
  "clarification_required",
  "verification_review",
  "execution_failed",
  "run_stalled",
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];

/** The kind of source object an attention item points back at. */
export const ATTENTION_SOURCE_TYPES = [
  "permission_request",
  "plan",
  "form",
  "verification_packet",
  "agent_run",
  "ticket",
] as const;
export type AttentionSourceType = (typeof ATTENTION_SOURCE_TYPES)[number];

/**
 * Attention lifecycle states. NOTE: focus/expansion is purely client-side UI state
 * and is NOT persisted — only action outcomes (resolved/dismissed) and the
 * system-derived expired/superseded are stored. `open` is the sole active state.
 */
export const ATTENTION_STATUSES = [
  "open",
  "resolved",
  "dismissed",
  "expired",
  "superseded",
] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

/** Priority ordering (presentational; does not change behavior). */
export const ATTENTION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type AttentionPriority = (typeof ATTENTION_PRIORITIES)[number];

/** An attention-queue row, camelCase domain shape (DB columns are snake_case). */
export interface AttentionItem {
  id: string;
  projectId: string;
  attentionType: AttentionType;
  sourceType: AttentionSourceType;
  sourceId: string;
  ticketId: string | null;
  runId: string | null;
  status: AttentionStatus;
  priority: AttentionPriority;
  title: string;
  summary: string;
  requiredAction: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  dismissedAt: string | null;
  expiresAt: string | null;
}

/** Input to {@link AttentionRepository.open}. */
export interface OpenAttentionInput {
  /** Defaults to DEFAULT_PROJECT_ID ('local-project'). */
  projectId?: string;
  attentionType: AttentionType;
  sourceType: AttentionSourceType;
  sourceId: string;
  ticketId?: string | null;
  runId?: string | null;
  /** Defaults to 'normal'. */
  priority?: AttentionPriority;
  title: string;
  summary?: string;
  requiredAction: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}

/** Narrowing filter for {@link AttentionRepository.list}. */
export interface AttentionListFilter {
  status?: AttentionStatus;
  attentionType?: AttentionType;
  projectId?: string;
  ticketId?: string;
}
