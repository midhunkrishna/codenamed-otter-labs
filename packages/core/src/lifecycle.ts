/**
 * Ticket lifecycle state machine (MIN-15) — backend is the sole lifecycle authority.
 *
 * Pure (no db, no I/O). Encodes the structural transition map from plan §4 and the
 * MVP guards:
 *  - `→ in_progress` requires `blockStatus === 'none'` (ENFORCED).
 *  - `planApproved` gates `→ executable` / `→ in_progress` but is **permissive for MVP**
 *    (defaults to allowed) — the plan-approval workflow is DEFERRED (plan §2 / context).
 *
 * `nextTransitions` returns only the currently-allowed targets so the UI never offers a
 * disallowed action (UI invents no lifecycle rules — plan §7).
 */
import type { BlockStatus, TicketStatus } from "@otter/shared";

/** Structural transition map (plan §4). `done` and `canceled` are terminal. */
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  created: ["plannable", "canceled"],
  plannable: ["needs_user_approval", "canceled"],
  needs_user_approval: ["executable", "plannable", "canceled"],
  executable: ["in_progress", "plannable", "canceled"],
  in_progress: ["needs_user_review", "failed", "canceled"],
  needs_user_review: ["done", "in_progress", "failed", "canceled"],
  failed: ["plannable", "canceled"],
  done: [],
  canceled: [],
};

/** Context the guards consult when deciding whether a transition is allowed. */
export interface TransitionContext {
  /** Current block status of the ticket. `→ in_progress` requires `'none'`. */
  blockStatus: BlockStatus;
  /**
   * Whether an approved plan exists. Gates `→ executable` / `→ in_progress`.
   * DEFERRED for MVP — defaults to permissive (treated as `true`).
   */
  planApproved?: boolean;
}

/** Targets that require an approved plan (gated by the permissive `planApproved` hook). */
const PLAN_GATED: ReadonlySet<TicketStatus> = new Set<TicketStatus>(["executable", "in_progress"]);

/**
 * True iff `from → to` is a structurally-valid transition that also satisfies the MVP guards.
 *
 * Guards:
 *  - `→ in_progress` requires `ctx.blockStatus === 'none'`.
 *  - plan-gated targets require `planApproved` — but it is permissive (undefined ⇒ allowed).
 */
export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
  ctx: TransitionContext,
): boolean {
  if (!TRANSITIONS[from]?.includes(to)) return false;
  if (to === "in_progress" && ctx.blockStatus !== "none") return false;
  // planApproved is permissive for MVP: only blocks when EXPLICITLY false.
  if (PLAN_GATED.has(to) && ctx.planApproved === false) return false;
  return true;
}

/** The currently-allowed transition targets from `from` given `ctx` (filtered by guards). */
export function nextTransitions(from: TicketStatus, ctx: TransitionContext): TicketStatus[] {
  return (TRANSITIONS[from] ?? []).filter((to) => canTransition(from, to, ctx));
}
