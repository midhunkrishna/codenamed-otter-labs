import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/* ── Shell brand + footer chrome ─────────────────────────────── */

export const brand = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const brandMark = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: vars.radius.base,
  backgroundColor: vars.color.accentSoft,
  color: vars.color.accent,
  fontFamily: vars.font.sans,
  fontWeight: 700,
});

export const topbar = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space.s4,
  width: "100%",
});

export const sidebarFooter = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s3,
  paddingInline: space.s3,
});

export const pageBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
});

/* ── Board ───────────────────────────────────────────────────── */

export const board = style({
  // Fixed-width columns that scroll horizontally (kanban), not fluid columns
  // that stretch to fill the viewport. Top/side padding gives the board room to
  // breathe below the topbar; bottom padding clears the horizontal scrollbar.
  display: "flex",
  alignItems: "flex-start",
  gap: space.s4,
  overflowX: "auto",
  overflowY: "hidden",
  padding: `${space.s4} ${space.s4} ${space.s5}`,
});

export const column = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  width: 280,
  minWidth: 280,
  flexShrink: 0,
  // Thin divider between columns (reference: border-right on all but the last).
  selectors: {
    "&:not(:last-of-type)": {
      borderInlineEnd: `1px solid ${vars.color.border}`,
    },
  },
});

/** The scrollable card well under a column header. Holds the composer, cards,
 * and the add-card affordance at the reference row gap. Small inline padding so
 * cards don't sit flush against the column divider. */
export const columnBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
  minHeight: 60,
  paddingInline: space.s1,
});

export const columnHeader = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  paddingBottom: space.s1,
  paddingInline: space.s1,
});

export const columnHeadRow = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const columnDot = style({
  width: 8,
  height: 8,
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const columnTitleText = style({
  // 13px label (reference), not the 14px body size. The token is a `font`
  // shorthand, so it must include a family to apply.
  font: `${vars.text.card} ${vars.font.sans}`,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
});

export const columnSpacer = style({
  flex: 1,
});

export const columnHint = style({
  font: `${vars.text.meta} ${vars.font.sans}`,
  color: vars.color.textMuted,
  margin: 0,
});

export const newTicketTrigger = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  padding: `${space.s1} 0`,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text },
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

/** Reset for the button that wraps each TicketCard (keeps it clickable). */
export const cardButton = style({
  display: "block",
  width: "100%",
  padding: 0,
  border: "none",
  background: "none",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: vars.radius.base,
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

/* ── Ticket composer (quick capture, in-column) ──────────────── */

export const composer = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.borderStrong}`,
  backgroundColor: vars.color.card,
  boxShadow: vars.shadow.card,
});

export const composerInput = style({
  width: "100%",
  border: "none",
  background: "transparent",
  resize: "none",
  outline: "none",
  color: vars.color.text,
  font: vars.text.card,
  fontFamily: vars.font.sans,
  selectors: {
    "&::placeholder": { color: vars.color.textFaint },
  },
});

export const composerFoot = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space.s2,
});

export const composerHint = style({
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textFaint,
});

export const composerActions = style({
  display: "flex",
  gap: space.s2,
});

/* ── New-ticket header trigger (＋ in the Created column) ───────── */

export const newTicketIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "none",
  background: "none",
  borderRadius: vars.radius.sm,
  color: vars.color.textMuted,
  cursor: "pointer",
  lineHeight: 1,
  selectors: {
    "&:hover": { color: vars.color.text, background: vars.color.surface2 },
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

/* ── Forms / inputs ──────────────────────────────────────────── */

export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.card,
});

export const formRow = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s3,
  alignItems: "flex-end",
});

export const fieldLabel = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  flex: 1,
  minWidth: 180,
});

export const input = style({
  width: "100%",
  height: space.controlHeight,
  paddingInline: space.controlPadX,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface2,
  color: vars.color.text,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

export const textarea = style([
  input,
  {
    height: "auto",
    minHeight: 72,
    paddingBlock: space.s2,
    resize: "vertical",
  },
]);

export const errorText = style({
  color: vars.color.toneRed,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  margin: 0,
});

/* ── Ticket detail ───────────────────────────────────────────── */

export const detail = style({
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
});

export const detailSection = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.card,
});

export const actionRow = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s2,
});

export const commentStream = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const comment = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  padding: space.s2,
  borderRadius: vars.radius.base,
  backgroundColor: vars.color.surface2,
});

export const commentAuthor = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const commentBody = style({
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.text,
});
