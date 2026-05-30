/**
 * REST client for the Agent Runs + Claude + Project surfaces (MIN-32 consumes
 * MIN-19 / MIN-18 / MIN-45). Mirrors the style of `api/client.ts` and reuses its
 * `request` helper. Web is standalone and does NOT import `@otter/shared`; the
 * domain shapes below are a local mirror of the frozen run contracts (plan §3a).
 */
import { request } from "./client";

// ---------------------------------------------------------------------------
// Run domain mirror (local copy; node-free bundle convention).
// ---------------------------------------------------------------------------

/** A run's lifecycle type (plan §3a RUN_TYPES). */
export type RunType = "planning" | "execution" | "manual" | "review";

/** A run's lifecycle status (plan §3a RUN_STATUSES). */
export type RunStatus =
  | "queued"
  | "running"
  | "waiting_on_permission"
  | "waiting_on_user_input"
  | "completed"
  | "failed"
  | "canceled";

/** Statuses from which a run can no longer be canceled (plan §3a). */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  "completed",
  "failed",
  "canceled",
] as const;

/** True when a run is in a terminal state (cancel is a no-op / 409). */
export function isTerminalRun(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

/** True when a run is awaiting a human (permission or input). */
export function isWaitingRun(status: RunStatus): boolean {
  return status === "waiting_on_permission" || status === "waiting_on_user_input";
}

/** A persisted agent run (mirror of `AgentRun`). */
export interface AgentRun {
  id: string;
  projectId: string;
  ticketId: string | null;
  type: RunType;
  status: RunStatus;
  title: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A persisted run event kind (mirror of AgentRunEvent.kind). */
export type RunEventKind =
  | "status_changed"
  | "output_delta"
  | "log"
  | "permission_requested"
  | "user_input_requested"
  | "note";

/** A persisted, append-only run event (mirror of `AgentRunEvent`). */
export interface AgentRunEvent {
  id: string;
  runId: string;
  seq: number;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** The default project as returned by `GET /api/project` (MIN-45). */
export interface Project {
  id: string;
  name: string;
  root: string;
  dataDir: string;
  createdAt: string;
  updatedAt: string;
}

/** Claude readiness probe result (`GET /api/claude/status`, MIN-18). */
export interface ClaudeStatus {
  ready: boolean;
  version?: string;
  error?: string;
}

/** Optional server-side filters for `GET /api/runs`. */
export interface RunListFilter {
  projectId?: string;
  ticketId?: string;
  status?: RunStatus;
}

/** Body accepted by `POST /api/runs`. */
export interface CreateRunInput {
  type: RunType;
  ticketId?: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Endpoints (all under `/api`, errors keep the `{error}` shape).
// ---------------------------------------------------------------------------

/** `GET /api/runs?projectId=&ticketId=&status=` — newest first. */
export function listRuns(filter: RunListFilter = {}): Promise<AgentRun[]> {
  const params = new URLSearchParams();
  if (filter.projectId) params.set("projectId", filter.projectId);
  if (filter.ticketId) params.set("ticketId", filter.ticketId);
  if (filter.status) params.set("status", filter.status);
  const qs = params.toString();
  return request<AgentRun[]>(`/runs${qs ? `?${qs}` : ""}`);
}

/** `GET /api/runs/:id`. */
export function getRun(id: string): Promise<AgentRun> {
  return request<AgentRun>(`/runs/${id}`);
}

/** `GET /api/runs/:id/events` — seq ascending. */
export function getRunEvents(id: string): Promise<AgentRunEvent[]> {
  return request<AgentRunEvent[]>(`/runs/${id}/events`);
}

/** `POST /api/runs` — create a run (201). */
export function createRun(input: CreateRunInput): Promise<AgentRun> {
  return request<AgentRun>("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** `POST /api/runs/:id/cancel` — 409 (with `{error}`) if the run is terminal. */
export function cancelRun(id: string): Promise<AgentRun> {
  return request<AgentRun>(`/runs/${id}/cancel`, { method: "POST" });
}

/** `GET /api/claude/status` — re-probes Claude readiness (MIN-18). */
export function getClaudeStatus(): Promise<ClaudeStatus> {
  return request<ClaudeStatus>("/claude/status");
}

/** `GET /api/project` — the current default project (MIN-45). */
export function getProject(): Promise<Project> {
  return request<Project>("/project");
}
