import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

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
  borderLeftColor: vars.color.ownerAgent,
  borderRadius: vars.radius.base,
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

export const eyebrow = style({
  fontSize: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  color: vars.color.ownerAgent,
});

export const author = style({
  fontWeight: 700,
  fontFamily: vars.font.sans,
});

export const stateTag = style({
  marginLeft: "auto",
  fontSize: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const footer = style({
  paddingTop: space.s2,
  borderTop: `1px solid ${vars.color.border}`,
});
