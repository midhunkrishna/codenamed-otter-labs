/**
 * Minimal REST client for the Otter Labs backend.
 *
 * Web is standalone and does NOT import `@otter/shared`; we keep a local mirror
 * of the frozen `/api` prefix. Same-origin relative URLs are used because the
 * Vite dev server proxies `/api` -> the backend (see vite.config.ts).
 */

/** All REST endpoints live under this prefix (MIN-13 invariant). */
export const API_PREFIX = "/api";

/** Response body of `GET /api/health` (mirror of the MIN-11 <-> MIN-13 contract). */
export interface HealthResponse {
  status: "ok";
  uptimeMs: number;
  dataDir: string;
}

/** Thin JSON fetch wrapper. Throws on non-2xx responses, surfacing the
 * backend's `{error}` message when present (HTTP contract §3b). */
export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new Error(message);
  }
  // 204/empty bodies are not expected on this contract, but guard anyway.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** JSON-body helper for POST/PATCH requests. */
function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** Calls `GET /api/health`. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ---------------------------------------------------------------------------
// Ticket-core domain mirror (local copy; web does NOT import @otter/shared).
// Frozen by plan §3a/§3b.
// ---------------------------------------------------------------------------

/** Lifecycle states (9). The first 7 are the Board columns; canceled/failed
 * are reachable via transitions but are not shown as columns (MIN-16). */
export type TicketStatus =
  | "created"
  | "plannable"
  | "needs_user_approval"
  | "executable"
  | "in_progress"
  | "needs_user_review"
  | "done"
  | "canceled"
  | "failed";

/** Block guard state. */
export type BlockStatus = "none" | "blocked";

/** A ticket as returned by `/api/tickets*`. */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  blockStatus: BlockStatus;
  /** The approved plan this ticket points at, or null (MIN-23). */
  approvedPlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A comment as returned by `/api/tickets/:id/comments`. */
export interface Comment {
  id: string;
  ticketId: string;
  author: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Response of `GET /api/tickets/:id/transitions`. The UI renders ONLY the
 * `next` array as actions — it invents no lifecycle rules (invariant §7). */
export interface TransitionsResponse {
  current: TicketStatus;
  next: TicketStatus[];
}

/** `GET /api/tickets` — all tickets, oldest first. */
export function listTickets(): Promise<Ticket[]> {
  return request<Ticket[]>("/tickets");
}

/** `POST /api/tickets` — create a ticket (status defaults to `created`). */
export function createTicket(input: {
  title: string;
  description?: string;
}): Promise<Ticket> {
  return request<Ticket>("/tickets", jsonBody("POST", input));
}

/** `GET /api/tickets/:id`. */
export function getTicket(id: string): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`);
}

/** `PATCH /api/tickets/:id` — edit title/description (never status). */
export function updateTicket(
  id: string,
  input: { title?: string; description?: string },
): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`, jsonBody("PATCH", input));
}

/** `GET /api/tickets/:id/comments` — oldest first. */
export function listComments(ticketId: string): Promise<Comment[]> {
  return request<Comment[]>(`/tickets/${ticketId}/comments`);
}

/** `POST /api/tickets/:id/comments`. */
export function createComment(
  ticketId: string,
  input: { body: string; author?: string; metadata?: Record<string, unknown> },
): Promise<Comment> {
  return request<Comment>(
    `/tickets/${ticketId}/comments`,
    jsonBody("POST", input),
  );
}

/** `GET /api/tickets/:id/transitions` — backend-owned valid next states. */
export function getTransitions(ticketId: string): Promise<TransitionsResponse> {
  return request<TransitionsResponse>(`/tickets/${ticketId}/transitions`);
}

/** `POST /api/tickets/:id/transitions` — apply a transition; returns ticket. */
export function postTransition(
  ticketId: string,
  input: { to: TicketStatus; detail?: string },
): Promise<Ticket> {
  return request<Ticket>(
    `/tickets/${ticketId}/transitions`,
    jsonBody("POST", input),
  );
}
