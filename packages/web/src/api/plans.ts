/**
 * REST client for the Plans + approval surface (MIN-23). Mirrors the style of
 * `api/runs.ts` and reuses the `request` helper. Web is standalone and does NOT
 * import `@otter/shared`; the domain shapes below are a local mirror of the
 * frozen plan contracts (plan §2.2 / §2.6).
 */
import { request } from "./client";
import type { Ticket } from "./client";

// ---------------------------------------------------------------------------
// Plan domain mirror (local copy; node-free bundle convention; plan §2.2).
// ---------------------------------------------------------------------------

/** A plan's lifecycle status (plan §2.2 PLAN_STATUSES). */
export type PlanStatus = "proposed" | "approved" | "sent_back" | "superseded";

/** A persisted, versioned plan artifact (mirror of `Plan`). */
export interface Plan {
  id: string;
  ticketId: string;
  runId: string | null;
  version: number;
  title: string;
  status: PlanStatus;
  content: string;
  artifactPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response body of the approve / send-back endpoints (plan §2.6). */
export interface PlanDecisionResult {
  ticket: Ticket;
  plan: Plan;
}

// ---------------------------------------------------------------------------
// Endpoints (all under `/api`, errors keep the `{error}` shape).
// ---------------------------------------------------------------------------

/** `GET /api/tickets/:id/plans` — newest version first (version DESC). */
export function getTicketPlans(ticketId: string): Promise<Plan[]> {
  return request<Plan[]>(`/tickets/${ticketId}/plans`);
}

/** `GET /api/plans/:id`. */
export function getPlan(id: string): Promise<Plan> {
  return request<Plan>(`/plans/${id}`);
}

/** `POST /api/plans/:id/approve` — 409 (with `{error}`) on guard failure. */
export function approvePlan(planId: string): Promise<PlanDecisionResult> {
  return request<PlanDecisionResult>(`/plans/${planId}/approve`, {
    method: "POST",
  });
}

/** `POST /api/plans/:id/send-back` — feedback is required (non-empty). */
export function sendBackPlan(
  planId: string,
  feedback: string,
): Promise<PlanDecisionResult> {
  return request<PlanDecisionResult>(`/plans/${planId}/send-back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
}
