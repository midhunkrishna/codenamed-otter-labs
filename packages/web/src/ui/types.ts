/**
 * FROZEN CONTRACT (orchestrator-owned, plan 003-design-system).
 *
 * Public prop API for every primitive component. Frozen so the core-primitive
 * track, the domain-primitive track, and the integration track agree on the
 * surface without waiting on each other's implementation. Changes to a shape
 * here must be negotiated on the channel and re-frozen.
 *
 * Component API direction (from MIN-43):
 *   <Card owner="agent" tone="in_progress">…</Card>
 *   <Pill tone="risk.medium">Medium risk</Pill>
 *   <AttentionCard type="permission" priority="high" />
 */
import type { ReactNode } from "react";
import type {
  AttentionType,
  BlockStatus,
  Density,
  Owner,
  Priority,
  Risk,
  TicketStatus,
  ThemeName,
  Tone,
} from "../design/tokens";

// Re-export the semantic domain types so primitives and their consumers can
// import everything they need from a single module (`./types`) without
// reaching into `design/tokens` directly.
export type {
  AttentionType,
  BlockStatus,
  Density,
  Owner,
  Priority,
  Risk,
  TicketStatus,
  ThemeName,
  Tone,
} from "../design/tokens";

/* ── Shared ───────────────────────────────────────────────────── */

export interface BaseProps {
  className?: string;
  children?: ReactNode;
}

/**
 * A semantic tone selector accepted by Pill/Badge. Either a status tone
 * ("status.done"), a risk tone ("risk.medium"), an attention tone
 * ("attention.permission"), an owner tone ("owner.agent"), or a bare neutral.
 */
export type ToneSelector =
  | `status.${TicketStatus}`
  | `risk.${Risk}`
  | `attention.${AttentionType}`
  | `owner.${Owner}`
  | "neutral"
  | "accent";

/* ── Layout / chrome ──────────────────────────────────────────── */

export interface AppShellProps extends BaseProps {
  sidebar: ReactNode;
  topbar?: ReactNode;
}

export interface NavEntry {
  id: string;
  label: string;
  /** Optional count badge (e.g. pending approvals); `tone` colors it. */
  badge?: number;
  badgeTone?: ToneSelector;
  icon?: ReactNode;
}

export interface NavSection {
  title?: string;
  items: NavEntry[];
}

export interface SidebarProps extends BaseProps {
  brand?: ReactNode;
  sections: NavSection[];
  activeId: string;
  onNavigate(id: string): void;
  /** Collapsed rail (56px, icon-only). */
  collapsed?: boolean;
  /** Pinned to the bottom (e.g. Settings). */
  footer?: ReactNode;
}

export interface PageHeaderProps extends BaseProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export interface SectionHeaderProps extends BaseProps {
  title: ReactNode;
  /** Uppercase eyebrow tag to the right (design language §sub-hd). */
  tag?: ReactNode;
  actions?: ReactNode;
}

/* ── Generic surfaces ─────────────────────────────────────────── */

export interface CardProps extends BaseProps {
  /** Owner stripe on the left edge: warm=user, cool=agent, amber=blocked. */
  owner?: Owner;
  /** Lifecycle status tone applied to the card's accents. */
  tone?: TicketStatus;
  /** Renders the amber block stripe banner across the top. */
  blockReason?: ReactNode;
  interactive?: boolean;
  onClick?(): void;
}

export interface PillProps extends BaseProps {
  tone?: ToneSelector;
}

export interface BadgeProps extends BaseProps {
  tone?: ToneSelector;
  /** Numeric count badge variant. */
  count?: number;
}

export type ButtonVariant = "primary" | "default" | "danger" | "ghost";
export interface ButtonProps extends BaseProps {
  variant?: ButtonVariant;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?(): void;
  "aria-label"?: string;
}

export interface DrawerProps extends BaseProps {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  /** "side" = 520px right drawer (default); "full" = full-screen overlay. */
  mode?: "side" | "full";
  /** Extra controls rendered in the header, left of the close button (e.g. an
   * expand/collapse toggle). */
  headerActions?: ReactNode;
}

export interface TabItem {
  id: string;
  label: ReactNode;
}
export interface TabsProps extends BaseProps {
  tabs: TabItem[];
  activeId: string;
  onSelect(id: string): void;
}

export interface EmptyStateProps extends BaseProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export interface CodeBlockProps extends BaseProps {
  /** Raw code/command; rendered in the mono font, never paraphrased. */
  code: string;
  inline?: boolean;
}

export interface MetadataRowProps extends BaseProps {
  /** label/value pairs rendered in the design language's facts grid. */
  items: { label: ReactNode; value: ReactNode }[];
  columns?: 1 | 2;
}

/* ── Domain primitives ────────────────────────────────────────── */

export interface PhaseInfo {
  owner: Owner;
  label: ReactNode;
  /** 0–100; when present and owner=agent, shows progress + pulsing dot. */
  percent?: number;
}

export interface TicketCardProps extends BaseProps {
  ticketKey: string;
  title: ReactNode;
  status: TicketStatus;
  owner: Owner;
  blockStatus?: BlockStatus;
  blockReason?: ReactNode;
  phase?: PhaseInfo;
  priority?: ReactNode;
  pills?: ReactNode;
  assignees?: ReactNode;
  onClick?(): void;
}

export interface AttentionCardProps extends BaseProps {
  type: AttentionType;
  priority: Priority;
  title: ReactNode;
  summary?: ReactNode;
  requiredAction?: ReactNode;
  ticketKey?: string;
  onClick?(): void;
}

export interface ExpandedAttentionCardProps extends AttentionCardProps {
  /** Source-specific expanded body (permission/plan/question/verification). */
  children?: ReactNode;
  /** Sticky while the user is acting on it. */
  sticky?: boolean;
}

export interface ApprovalCardProps extends BaseProps {
  actor: ReactNode;
  intent: ReactNode;
  command: string;
  risk: Risk;
  facts: { label: ReactNode; value: ReactNode }[];
  onApprove?(): void;
  onDeny?(): void;
  onRevise?(): void;
}

export type PlanState = "proposed" | "approved" | "rejected" | "superseded";
export interface PlanCardProps extends BaseProps {
  version: string;
  state: PlanState;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  onApprove?(): void;
  onReject?(): void;
}

export type FormCommentState =
  | "open"
  | "submitted"
  | "dismissed"
  | "expired"
  | "superseded";
export interface FormCommentCardProps extends BaseProps {
  author: ReactNode;
  state: FormCommentState;
  /** Blocks the ticket while open. */
  blocking?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}

/** The four Diátaxis-inspired review lenses (MIN-40/41). */
export const VERIFICATION_TABS = ["walkthrough", "verify", "facts", "why"] as const;
export type VerificationTab = (typeof VERIFICATION_TABS)[number];
export interface VerificationPacketTabsProps extends BaseProps {
  activeTab: VerificationTab;
  onSelect(tab: VerificationTab): void;
  walkthrough?: ReactNode;
  verify?: ReactNode;
  facts?: ReactNode;
  why?: ReactNode;
}

/* ── Theme provider API (implemented by the foundation track) ─── */

export interface ThemeContextValue {
  theme: ThemeName;
  density: Density;
  setTheme(theme: ThemeName): void;
  setDensity(density: Density): void;
}
