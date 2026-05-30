import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/* ── Runs list (grouped by status) ───────────────────────────── */

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
});

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
});

export const groupHead = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const groupItems = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
});

/** A single run row — a full-width clickable button reset. */
export const runRow = style({
  display: "flex",
  alignItems: "center",
  gap: space.s3,
  width: "100%",
  textAlign: "left",
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.card,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.cardHover },
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

export const runRowMain = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  flex: 1,
  minWidth: 0,
});

export const runRowTitle = style({
  font: `${vars.text.card} ${vars.font.sans}`,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const runRowMeta = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space.s2,
  font: `${vars.text.meta} ${vars.font.sans}`,
  color: vars.color.textMuted,
});

/* ── Run detail ──────────────────────────────────────────────── */

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
  alignItems: "center",
  gap: space.s2,
});

export const pillRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space.s2,
});

/** A distinct callout banner for waiting_on_permission / waiting_on_user_input. */
export const waitingBanner = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.borderStrong}`,
  backgroundColor: vars.color.surface2,
});

export const waitingHead = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const waitingMessage = style({
  font: `${vars.text.body} ${vars.font.sans}`,
  color: vars.color.text,
  margin: 0,
});

/* ── Timeline ────────────────────────────────────────────────── */

export const timeline = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const timelineItem = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  padding: space.s2,
  borderRadius: vars.radius.base,
  backgroundColor: vars.color.surface2,
});

export const timelineHead = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const timelineKind = style({
  font: `${vars.text.eyebrow} ${vars.font.sans}`,
  color: vars.color.textMuted,
  textTransform: "uppercase",
});

export const timelineTime = style({
  font: `${vars.text.meta} ${vars.font.sans}`,
  color: vars.color.textFaint,
  marginLeft: "auto",
});

export const timelineBody = style({
  font: `${vars.text.body} ${vars.font.sans}`,
  color: vars.color.text,
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export const errorText = style({
  color: vars.color.toneRed,
  font: `${vars.text.meta} ${vars.font.sans}`,
  margin: 0,
});

export const muted = style({
  font: `${vars.text.meta} ${vars.font.sans}`,
  color: vars.color.textMuted,
  margin: 0,
});
