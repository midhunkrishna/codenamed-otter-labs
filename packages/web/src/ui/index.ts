/**
 * Primitive library public surface. FROZEN filenames + export names
 * (orchestrator-owned). Impl-B owns the core/layout set; Impl-C owns the domain
 * set. Each component lives in `<Name>.tsx` with a sibling `<Name>.css.ts`.
 *
 * NOTE: this barrel references files created across parallel tracks, so a full
 * project typecheck only passes once every track has landed (Phase 4). During
 * Wave 1, each track runs vitest against its OWN component files directly.
 */
export * from "./types";

// ── Core / layout primitives (Impl-B) ──────────────────────────
export { AppShell } from "./AppShell";
export { Sidebar } from "./Sidebar";
export { PageHeader } from "./PageHeader";
export { SectionHeader } from "./SectionHeader";
export { Card } from "./Card";
export { Pill } from "./Pill";
export { Badge } from "./Badge";
export { Button } from "./Button";
export { Drawer } from "./Drawer";
export { Tabs } from "./Tabs";
export { EmptyState } from "./EmptyState";
export { CodeBlock } from "./CodeBlock";
export { MetadataRow } from "./MetadataRow";

// ── Domain primitives (Impl-C) ─────────────────────────────────
export { TicketCard } from "./TicketCard";
export { AttentionCard } from "./AttentionCard";
export { ExpandedAttentionCard } from "./ExpandedAttentionCard";
export { ApprovalCard } from "./ApprovalCard";
export { PlanCard } from "./PlanCard";
export { FormCommentCard } from "./FormCommentCard";
export { VerificationPacketTabs } from "./VerificationPacketTabs";
