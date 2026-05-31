/**
 * Artifact writer (MIN-33, plan §2.5).
 *
 * Writes durable plan artifacts under `<dataDir>/artifacts/plans`. Path-safety is an
 * invariant: `name` MUST be a single path segment — anything containing `/`, `\`, `..`,
 * an absolute path, or a name whose resolved path escapes the plans dir is rejected.
 * The writer NEVER throws; all failures (validation or I/O) return `{ ok: false, error }`.
 *
 * Returns `relPath` relative to `dataDir` (e.g. `artifacts/plans/<ticket>-v2.md`) for
 * storage on `plan.artifact_path` and consumption by the Docs API.
 *
 * Execution-report artifacts are OUT OF SCOPE this theme (deferred under MIN-46): only
 * `kind: 'plan'` is supported.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface WriteArtifactInput {
  dataDir: string;
  kind: "plan";
  name: string;
  content: string;
}

export type WriteArtifactResult =
  | { ok: true; relPath: string; absPath: string }
  | { ok: false; error: string };

/**
 * True iff `name` is a safe single path segment (no separators, no traversal, not absolute).
 */
function isSafeSegment(name: string): boolean {
  if (name.length === 0) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (isAbsolute(name)) return false;
  return true;
}

/**
 * Write a plan artifact. Path-safe and total (never throws).
 *
 * @returns `{ ok: true, relPath, absPath }` on success, `{ ok: false, error }` on any
 *          validation or filesystem failure.
 */
export function writeArtifact(input: WriteArtifactInput): WriteArtifactResult {
  const { dataDir, kind, name, content } = input;

  if (kind !== "plan") {
    return { ok: false, error: `unsupported artifact kind: ${String(kind)}` };
  }
  if (typeof name !== "string" || !isSafeSegment(name)) {
    return { ok: false, error: "artifact name must be a single safe path segment" };
  }

  const plansDir = resolve(join(dataDir, "artifacts", "plans"));
  const absPath = resolve(join(plansDir, name));

  // Defence-in-depth: even if the segment check passed, ensure the resolved path
  // stays strictly under the plans dir.
  const rel = relative(plansDir, absPath);
  if (rel === "" || rel.startsWith("..") || rel.includes(sep) || isAbsolute(rel)) {
    return { ok: false, error: "artifact path escapes the plans directory" };
  }

  try {
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(absPath, content, "utf8");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `failed to write artifact: ${message}` };
  }

  const relPath = relative(resolve(dataDir), absPath);
  return { ok: true, relPath, absPath };
}
