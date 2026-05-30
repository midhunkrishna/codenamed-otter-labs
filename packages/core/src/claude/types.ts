/**
 * Normalized Claude-runtime driver events (MIN-44, plan §3a) — FROZEN contract.
 *
 * Orchestrator-owned, written verbatim from the plan. Impl-A (the pure stream
 * normalizer) and Impl-B (the subprocess runner + append/emit sink) both import
 * this so they agree on the shape of a driver event without depending on each
 * other. Treat this union and the `ClaudeRunner` interface as immutable — if it
 * must change, re-sync over the channel log first.
 *
 * A `ClaudeRunEvent` is the *internal* normalization of a single Claude Code
 * `stream-json` line (plan §3d). It is deliberately decoupled from both the
 * persisted `RUN_EVENT_KINDS` and the WebSocket bus payloads — the runner maps
 * one onto the others (plan §3b mapping table).
 */

/** A single normalized driver event derived from Claude Code's stream-json output. */
export type ClaudeRunEvent =
  | { type: "run.started"; runId: string }
  | { type: "claude.session_detected"; runId: string; claudeSessionId: string }
  | { type: "run.output.delta"; runId: string; text: string }
  | { type: "run.structured_result"; runId: string; value: unknown }
  | { type: "run.tool_deferred"; runId: string; toolUse: unknown }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId: string; error: string };

/**
 * The lifecycle surface the subprocess driver exposes (plan §3a). Implementations
 * (e.g. `createClaudeCodeSubprocessRunner`, plan §3c) drive a run to a terminal
 * state asynchronously, persisting each event before broadcasting it. None of
 * these methods reject to the event loop — a crashing Claude process becomes a
 * `failed` run, never an unhandled rejection (MIN-44 invariant 3).
 */
export interface ClaudeRunner {
  startPlanningRun(input: { runId: string; projectRoot: string; contextMarkdown: string }): Promise<void>;
  startExecutionRun(input: { runId: string; projectRoot: string; contextMarkdown: string }): Promise<void>;
  resumeRun(input: {
    runId: string;
    projectRoot: string;
    claudeSessionId: string;
    promptMarkdown: string;
  }): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}
