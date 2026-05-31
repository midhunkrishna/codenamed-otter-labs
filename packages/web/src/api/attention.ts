/**
 * REST client for the Attention queue (MIN-23). Mirrors the style of
 * `api/runs.ts` and reuses the `request` helper. Web is standalone and does NOT
 * import `@otter/shared`; the shapes below mirror the frozen attention contract
 * (plan §2.2 / §2.6).
 */
import { request } from "./client";

// ---------------------------------------------------------------------------
// Attention domain mirror (local copy; node-free bundle convention; plan §2.2).
// ---------------------------------------------------------------------------

/** An attention item's kind. MVP = plan approval (plan §2.2 ATTENTION_KINDS). */
export type AttentionKind = "plan_approval";

/** An attention item's status (plan §2.2 ATTENTION_STATUSES). */
export type AttentionStatus = "open" | "resolved";

/** A persisted attention item (mirror of `AttentionItem`). */
export interface AttentionItem {
  id: string;
  ticketId: string | null;
  kind: AttentionKind;
  status: AttentionStatus;
  refId: string | null;
  detail: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Endpoints (all under `/api`, errors keep the `{error}` shape).
// ---------------------------------------------------------------------------

/** `GET /api/attention?status=open` — newest first. */
export function listAttention(
  status: AttentionStatus = "open",
): Promise<AttentionItem[]> {
  return request<AttentionItem[]>(`/attention?status=${status}`);
}
