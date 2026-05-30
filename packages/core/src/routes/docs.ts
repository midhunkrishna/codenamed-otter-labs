/**
 * Docs / artifacts API (MIN-33, plan §2.6).
 *
 *   GET /api/docs/artifacts             -> ArtifactSummary[]  (plan artifacts on disk)
 *   GET /api/docs/artifacts/plan/:name  -> { name, content } | 404
 *
 * Plan artifacts live under `<dataDir>/artifacts/plans` as `<ticketId>-v<version>.md`.
 * Execution-report artifacts are OUT OF SCOPE this theme (deferred under MIN-46): only
 * plan artifacts are listed/served. The `:name` viewer is path-safe — a single segment,
 * traversal rejected — mirroring the writer's invariant.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { API_PREFIX } from "@otter/shared";

/** A plan artifact file on disk, as surfaced by the Docs API. */
export interface ArtifactSummary {
  kind: "plan";
  name: string;
  relPath: string;
  size: number;
  modifiedAt: string;
  ticketId?: string;
  version?: number;
}

/** Where the docs routes read artifacts from. */
export interface DocsRoutesPaths {
  /** Absolute data dir; plan artifacts live under `<dataDir>/artifacts/plans`. */
  dataDir: string;
}

/** True iff `name` is a safe single path segment (no separators, no traversal, not absolute). */
function isSafeSegment(name: string): boolean {
  if (name.length === 0) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (isAbsolute(name)) return false;
  return true;
}

/** Parse `<ticketId>-v<version>.md` → { ticketId, version }; undefined fields if it doesn't match. */
function parseArtifactName(name: string): { ticketId?: string; version?: number } {
  const match = /^(.+)-v(\d+)\.md$/.exec(name);
  if (!match) return {};
  return { ticketId: match[1], version: Number(match[2]) };
}

/**
 * Register the Docs / artifacts routes. Repos are not needed — artifacts are read
 * straight from disk under `paths.dataDir`. (server.ts wires this in; we never edit it.)
 */
export function registerDocsRoutes(
  app: FastifyInstance,
  _db: unknown,
  paths: DocsRoutesPaths,
): void {
  const plansDir = resolve(join(paths.dataDir, "artifacts", "plans"));

  app.get(`${API_PREFIX}/docs/artifacts`, async () => {
    let entries: string[];
    try {
      entries = readdirSync(plansDir);
    } catch {
      // No plans dir yet → no artifacts.
      return [] as ArtifactSummary[];
    }
    const summaries: ArtifactSummary[] = [];
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const absPath = join(plansDir, name);
      let stat;
      try {
        stat = statSync(absPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const { ticketId, version } = parseArtifactName(name);
      const summary: ArtifactSummary = {
        kind: "plan",
        name,
        relPath: relative(resolve(paths.dataDir), absPath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
      if (ticketId !== undefined) summary.ticketId = ticketId;
      if (version !== undefined) summary.version = version;
      summaries.push(summary);
    }
    return summaries;
  });

  app.get<{ Params: { name: string } }>(
    `${API_PREFIX}/docs/artifacts/plan/:name`,
    async (req, reply) => {
      const { name } = req.params;
      if (!isSafeSegment(name)) {
        return reply.code(404).send({ error: "artifact not found" });
      }
      const absPath = resolve(join(plansDir, name));
      // Defence-in-depth: resolved path must stay strictly under the plans dir.
      const rel = relative(plansDir, absPath);
      if (rel === "" || rel.startsWith("..") || rel.includes(sep) || isAbsolute(rel)) {
        return reply.code(404).send({ error: "artifact not found" });
      }
      let content: string;
      try {
        content = readFileSync(absPath, "utf8");
      } catch {
        return reply.code(404).send({ error: "artifact not found" });
      }
      return { name, content };
    },
  );
}
