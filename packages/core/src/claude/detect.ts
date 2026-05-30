/**
 * Claude Code readiness probe (MIN-18, plan §3h).
 *
 * Resolves the `claude` binary (explicit override → env → PATH), runs
 * `<bin> --version` with a short timeout, and reports a structured readiness
 * result. This function NEVER throws to its caller: a missing/broken Claude
 * install must degrade gracefully (the app still boots, ticket CRUD still works,
 * and planning/execution runs fail with an actionable error) rather than crash.
 *
 * The boot probe is cached so the hot path (`/api/runs` guard, health) does not
 * spawn a subprocess on every request; `/api/claude/status` re-probes on demand.
 */
import { execFile } from "node:child_process";

/** Result of a Claude readiness probe (frozen shape, plan §3f/§3h). */
export interface ClaudeStatus {
  /** True when `<bin> --version` exited 0 within the timeout. */
  ready: boolean;
  /** Parsed version string when ready (best-effort from stdout). */
  version?: string;
  /** Actionable error (incl. how to fix) when not ready. */
  error?: string;
}

/** Options for {@link detectClaude}. */
export interface DetectClaudeOptions {
  /** Explicit binary path/name; overrides env + PATH default. */
  binPath?: string;
  /** Probe timeout in ms (default {@link DEFAULT_TIMEOUT_MS}). */
  timeoutMs?: number;
}

/** Default probe timeout — `claude --version` is fast; keep startup snappy. */
export const DEFAULT_TIMEOUT_MS = 3000;

/** Resolve the binary to probe: explicit override → env → `claude` on PATH. */
export function resolveClaudeBin(binPath?: string): string {
  return binPath ?? process.env.OTTER_CLAUDE_BIN ?? "claude";
}

/** Pull a version token out of `claude --version` stdout (best-effort). */
function parseVersion(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  // Typical output: "1.2.3 (Claude Code)". Prefer a semver-ish token, else the
  // whole first line so we never drop a real version we failed to pattern-match.
  const match = trimmed.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  if (match) return match[0];
  return trimmed.split("\n", 1)[0];
}

/**
 * Probe Claude readiness. Resolves (never rejects) with a {@link ClaudeStatus}.
 * `ready:true` + `version` on a clean `--version`; `ready:false` + an actionable
 * `error` when the binary is missing, exits non-zero, or times out.
 */
export function detectClaude(opts: DetectClaudeOptions = {}): Promise<ClaudeStatus> {
  const bin = resolveClaudeBin(opts.binPath);
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ClaudeStatus>((resolve) => {
    execFile(bin, ["--version"], { timeout }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ ready: true, version: parseVersion(String(stdout)) });
        return;
      }

      // Distinguish the common failure modes so the error tells the user how to fix it.
      const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
      if (err.code === "ENOENT") {
        resolve({
          ready: false,
          error:
            `Claude Code binary "${bin}" was not found on PATH. ` +
            `Install Claude Code (https://docs.claude.com/claude-code) or set OTTER_CLAUDE_BIN ` +
            `to the absolute path of the "claude" executable.`,
        });
        return;
      }
      if (err.killed === true || err.signal === "SIGTERM") {
        resolve({
          ready: false,
          error:
            `Claude Code readiness probe ("${bin} --version") timed out after ${timeout}ms. ` +
            `Verify the binary runs and responds, or raise the timeout / set OTTER_CLAUDE_BIN.`,
        });
        return;
      }
      const detail = String(stderr).trim() || err.message;
      resolve({
        ready: false,
        error:
          `Claude Code readiness probe ("${bin} --version") failed: ${detail}. ` +
          `Verify the install or set OTTER_CLAUDE_BIN to a working "claude" executable.`,
      });
    });
  });
}

let bootProbe: Promise<ClaudeStatus> | undefined;

/**
 * Cached boot probe. The first call runs (and memoizes) a default
 * {@link detectClaude}; subsequent calls reuse it. Used by the run-creation
 * guard + `/api/health` so they don't spawn a subprocess per request.
 */
export function getCachedClaudeStatus(): Promise<ClaudeStatus> {
  if (bootProbe === undefined) {
    bootProbe = detectClaude();
  }
  return bootProbe;
}

/**
 * Force a fresh probe and refresh the cache. Backs `/api/claude/status`
 * (acceptance: "re-probed on demand").
 */
export function refreshClaudeStatus(opts: DetectClaudeOptions = {}): Promise<ClaudeStatus> {
  bootProbe = detectClaude(opts);
  return bootProbe;
}

/** Test seam: drop the cached boot probe so the next call re-probes. */
export function resetClaudeStatusCache(): void {
  bootProbe = undefined;
}
