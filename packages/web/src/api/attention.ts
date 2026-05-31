/**
 * REST client for the unified Attention queue (MIN-36/37/38). Mirrors the style
 * of `api/runs.ts` and reuses the `request` helper. Web is standalone and does
 * NOT import `@otter/shared`; the shapes below are a local camelCase mirror of
 * the frozen canonical attention contract (plan 007 §1.1 / §1.5).
 *
 * Impl-C owns this module; Impl-D imports `AttentionType` + `AttentionItemVM`.
 */
import { request } from "./client";

// ---------------------------------------------------------------------------
// Attention domain mirror (local copy; node-free bundle convention; §1.5).
// ---------------------------------------------------------------------------

/** The 6 canonical attention types (mirror of `ATTENTION_TYPES`, §1.1). */
export type AttentionType =
  | "permission_request"
  | "plan_approval"
  | "clarification_required"
  | "verification_review"
  | "execution_failed"
  | "run_stalled";

/** The source object kinds an attention item can point at (mirror, §1.1). */
export type AttentionSourceType =
  | "permission_request"
  | "plan"
  | "form"
  | "verification_packet"
  | "agent_run"
  | "ticket";

/**
 * Lifecycle status of an attention item (mirror, §1.1). Focus/expansion is
 * client-side UI state and is NOT persisted, so it is not a status here.
 */
export type AttentionStatus =
  | "open"
  | "resolved"
  | "dismissed"
  | "expired"
  | "superseded";

/** Priority of an attention item (mirror, §1.1). */
export type AttentionPriority = "low" | "normal" | "high" | "urgent";

/**
 * A persisted attention item — camelCase view-model mirror of the backend
 * `AttentionItem` (§1.1). The page renders these through `AttentionItemCard`.
 */
export interface AttentionItemVM {
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

/** Optional server-side filters for `GET /api/attention` (§1.4). */
export interface AttentionListFilter {
  status?: AttentionStatus;
  attentionType?: AttentionType;
  project?: string;
}

// ---------------------------------------------------------------------------
// Endpoints (all under `/api`, errors keep the `{error}` shape).
// ---------------------------------------------------------------------------

/**
 * `GET /api/attention?status=&attention_type=&project=` — newest first.
 * A bare string is accepted as a `status` shorthand for the common call site.
 */
export function listAttention(
  filter: AttentionListFilter | AttentionStatus = {},
): Promise<AttentionItemVM[]> {
  const f: AttentionListFilter =
    typeof filter === "string" ? { status: filter } : filter;
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.attentionType) params.set("attention_type", f.attentionType);
  if (f.project) params.set("project", f.project);
  const qs = params.toString();
  return request<AttentionItemVM[]>(`/attention${qs ? `?${qs}` : ""}`);
}

/** `POST /api/attention/:id/dismiss` → the updated item. */
export function dismissAttention(id: string): Promise<AttentionItemVM> {
  return mutate(id, "dismiss");
}

/** `POST /api/attention/:id/resolve` → the updated item. */
export function resolveAttention(id: string): Promise<AttentionItemVM> {
  return mutate(id, "resolve");
}

/** Shared POST for the dismiss/resolve mutations (returns `{ item }`). */
async function mutate(
  id: string,
  action: "dismiss" | "resolve",
): Promise<AttentionItemVM> {
  const { item } = await request<{ item: AttentionItemVM }>(
    `/attention/${id}/${action}`,
    { method: "POST" },
  );
  return item;
}
