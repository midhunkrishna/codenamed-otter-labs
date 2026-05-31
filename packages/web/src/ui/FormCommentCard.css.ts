import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/* ── Outer agent comment ──────────────────────────────────────── */

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.cardPadY,
  paddingBottom: space.cardPadY,
  background: vars.color.card,
  border: `1px solid ${vars.color.border}`,
  borderLeftWidth: 3,
  borderLeftColor: vars.color.toneTeal,
  borderRadius: vars.radius.large,
  color: vars.color.text,
});

/** Resolved (non-open) states read muted so the open ones stand out. */
export const resolved = style({
  opacity: 0.7,
  borderLeftColor: vars.color.border,
});

export const head = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  flexWrap: "wrap",
});

/** Teal diamond avatar (rotated square) — the agent identity mark. */
export const avatar = style({
  width: "14px",
  height: "14px",
  flex: "0 0 auto",
  transform: "rotate(45deg)",
  borderRadius: vars.radius.sm,
  background: vars.color.toneTeal,
});

export const eyebrow = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  color: vars.color.ownerAgent,
});

export const author = style({
  fontWeight: 700,
  fontFamily: vars.font.sans,
  color: vars.color.text,
});

export const meta = style({
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const statusPill = style({
  marginLeft: "auto",
});

export const stateTag = style({
  marginLeft: "auto",
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const prose = style({
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  margin: 0,
});

/* ── Inner form card ──────────────────────────────────────────── */

export const formCard = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s3,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.cardPadY,
  paddingBottom: space.cardPadY,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.toneAmber}`,
  background: vars.color.toneAmberSoft,
});

export const formCardHead = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});

export const formCardTitle = style({
  display: "flex",
  alignItems: "center",
  gap: space.s1,
  marginRight: "auto",
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: vars.color.text,
});

/* ── Questions ────────────────────────────────────────────────── */

export const questions = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s3,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const question = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
});

export const qEyebrow = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  color: vars.color.textFaint,
});

export const qLabel = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  font: vars.text.card,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  color: vars.color.text,
});

export const requiredTag = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: vars.color.toneRed,
});

export const qHelp = style({
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

/* ── Option rows (radio / checkbox) ───────────────────────────── */

export const optionRows = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
});

export const optionRow = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  width: "100%",
  paddingLeft: space.controlPadX,
  paddingRight: space.controlPadX,
  paddingTop: space.s2,
  paddingBottom: space.s2,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.surface,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.text,
  cursor: "pointer",
  selectors: {
    "&[data-selected='true']": {
      borderColor: vars.color.accent,
    },
  },
});

/* ── Text inputs ──────────────────────────────────────────────── */

export const input = style({
  width: "100%",
  paddingLeft: space.controlPadX,
  paddingRight: space.controlPadX,
  paddingTop: space.s2,
  paddingBottom: space.s2,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.surface,
  color: vars.color.text,
  font: vars.text.body,
  fontFamily: vars.font.sans,
});

export const textarea = style({
  width: "100%",
  minHeight: "72px",
  paddingLeft: space.controlPadX,
  paddingRight: space.controlPadX,
  paddingTop: space.s2,
  paddingBottom: space.s2,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.surface,
  color: vars.color.text,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  resize: "vertical",
});

/* ── Body / footer (legacy slots + interactive footer) ────────── */

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const footer = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  flexWrap: "wrap",
});

export const helper = style({
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  marginRight: "auto",
});

export const submit = style({
  marginLeft: "auto",
});
