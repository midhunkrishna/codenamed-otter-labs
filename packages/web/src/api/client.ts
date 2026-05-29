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

/** Thin JSON fetch wrapper. Throws on non-2xx responses. */
export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Calls `GET /api/health`. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}
