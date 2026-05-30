/**
 * FROZEN CONTRACT (orchestrator-owned, plan 003-design-system).
 *
 * The semantic token layer. The design language requires components to consume
 * *semantic* tokens (owner / lifecycle status / risk / attention type), never
 * raw colors. Each accessor returns the contract var references for a `fg`
 * (foreground) and `soft` (background fill) pair, plus a stable `label`.
 *
 * The mapping (e.g. status.done → green) is intentionally theme-independent:
 * the *meaning* is constant; only the tone's concrete value changes per theme
 * (because `vars.color.toneGreen` differs per theme). This keeps the mapping
 * DRY while staying fully themeable.
 *
 * These names are frozen so all primitives and future UI tickets (Board,
 * Attention, Approvals, Forms, Verification) agree on the vocabulary.
 */
import { vars } from "./contract.css";

/** A resolved tone: foreground + soft fill, both contract-var references. */
export interface Tone {
  fg: string;
  soft: string;
}

/* ── Themes & density ─────────────────────────────────────────── */

export const THEMES = ["linear", "notion", "jira", "celebration"] as const;
export type ThemeName = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeName = "linear";

export const DENSITIES = ["compact", "regular", "comfy"] as const;
export type Density = (typeof DENSITIES)[number];
export const DEFAULT_DENSITY: Density = "regular";

/* ── Ownership ────────────────────────────────────────────────── */

export const OWNERS = ["user", "agent", "system", "blocked"] as const;
/** Who owns the next move on a card/ticket. `blocked` shifts the stripe amber. */
export type Owner = (typeof OWNERS)[number];

export const ownerTone: Record<Owner, Tone> = {
  user: { fg: vars.color.ownerUser, soft: vars.color.ownerUserSoft },
  agent: { fg: vars.color.ownerAgent, soft: vars.color.ownerAgentSoft },
  system: { fg: vars.color.ownerSystem, soft: vars.color.ownerSystemSoft },
  blocked: { fg: vars.color.ownerBlocked, soft: vars.color.ownerBlockedSoft },
};

/* ── Lifecycle status (mirrors @otter/shared TICKET_STATUSES) ──── */

export const TICKET_STATUSES = [
  "created",
  "plannable",
  "needs_user_approval",
  "executable",
  "in_progress",
  "needs_user_review",
  "done",
  "canceled",
  "failed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** status → tone, per the design language's tone palette legend. */
export const statusTone: Record<TicketStatus, Tone> = {
  created: { fg: vars.color.toneGray, soft: vars.color.toneGraySoft },
  plannable: { fg: vars.color.toneBlue, soft: vars.color.toneBlueSoft },
  needs_user_approval: { fg: vars.color.toneAmber, soft: vars.color.toneAmberSoft },
  executable: { fg: vars.color.toneTeal, soft: vars.color.toneTealSoft },
  in_progress: { fg: vars.color.toneViolet, soft: vars.color.toneVioletSoft },
  needs_user_review: { fg: vars.color.toneOrange, soft: vars.color.toneOrangeSoft },
  done: { fg: vars.color.toneGreen, soft: vars.color.toneGreenSoft },
  canceled: { fg: vars.color.toneGray, soft: vars.color.toneGraySoft },
  failed: { fg: vars.color.toneRed, soft: vars.color.toneRedSoft },
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: "Created",
  plannable: "Plannable",
  needs_user_approval: "Needs Approval",
  executable: "Executable",
  in_progress: "In Progress",
  needs_user_review: "Needs Review",
  done: "Done",
  canceled: "Canceled",
  failed: "Failed",
};

/* ── Risk ─────────────────────────────────────────────────────── */

export const RISKS = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISKS)[number];

export const riskTone: Record<Risk, Tone> = {
  low: { fg: vars.color.toneGreen, soft: vars.color.toneGreenSoft },
  medium: { fg: vars.color.toneAmber, soft: vars.color.toneAmberSoft },
  high: { fg: vars.color.toneOrange, soft: vars.color.toneOrangeSoft },
  critical: { fg: vars.color.toneRed, soft: vars.color.toneRedSoft },
};

export const RISK_LABELS: Record<Risk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/* ── Attention item types ─────────────────────────────────────── */

export const ATTENTION_TYPES = [
  "permission",
  "plan",
  "question",
  "verification",
  "failure",
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];

export const attentionTone: Record<AttentionType, Tone> = {
  permission: { fg: vars.color.toneAmber, soft: vars.color.toneAmberSoft },
  plan: { fg: vars.color.toneBlue, soft: vars.color.toneBlueSoft },
  question: { fg: vars.color.toneViolet, soft: vars.color.toneVioletSoft },
  verification: { fg: vars.color.toneOrange, soft: vars.color.toneOrangeSoft },
  failure: { fg: vars.color.toneRed, soft: vars.color.toneRedSoft },
};

export const ATTENTION_LABELS: Record<AttentionType, string> = {
  permission: "Permission",
  plan: "Plan",
  question: "Question",
  verification: "Verification",
  failure: "Failure",
};

/* ── Block status ─────────────────────────────────────────────── */

export const BLOCK_STATUSES = ["none", "blocked"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

/** Generic priority used by attention/approval cards. */
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
