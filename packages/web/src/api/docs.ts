/**
 * REST client for the Docs / artifacts surface (MIN-33). Mirrors the style of
 * `api/runs.ts` and reuses the `request` helper. Web is standalone and does NOT
 * import `@otter/shared`; the shapes below mirror the frozen artifact contract
 * (plan §2.6). Only `plan` artifacts exist this theme (execution reports are
 * deferred → MIN-46).
 */
import { request } from "./client";

// ---------------------------------------------------------------------------
// Artifact domain mirror (local copy; node-free bundle convention; plan §2.6).
// ---------------------------------------------------------------------------

/** Summary of a generated artifact file (plan §2.6 ArtifactSummary). */
export interface ArtifactSummary {
  kind: "plan";
  name: string;
  relPath: string;
  size: number;
  modifiedAt: string;
  ticketId?: string;
  planId?: string;
  version?: number;
}

/** Full artifact body returned by the single-artifact endpoint. */
export interface ArtifactContent {
  name: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Endpoints (all under `/api`, errors keep the `{error}` shape).
// ---------------------------------------------------------------------------

/** `GET /api/docs/artifacts` — all generated artifacts. */
export function listArtifacts(): Promise<ArtifactSummary[]> {
  return request<ArtifactSummary[]>("/docs/artifacts");
}

/** `GET /api/docs/artifacts/plan/:name` — a single plan artifact (404 if absent). */
export function getArtifact(name: string): Promise<ArtifactContent> {
  return request<ArtifactContent>(
    `/docs/artifacts/plan/${encodeURIComponent(name)}`,
  );
}
