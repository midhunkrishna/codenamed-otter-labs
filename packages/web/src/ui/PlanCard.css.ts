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
  borderRadius: vars.radius.base,
  color: vars.color.text,
});

export const head = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  flexWrap: "wrap",
});

export const version = style({
  fontFamily: vars.font.mono,
  fontSize: vars.text.meta,
  color: vars.color.textMuted,
});

export const title = style({
  fontSize: vars.text.card,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  margin: 0,
});

export const meta = style({
  fontSize: vars.text.meta,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const toggle = style({
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  fontSize: vars.text.meta,
  color: vars.color.accent,
});

export const body = style({
  paddingTop: space.s2,
  borderTop: `1px solid ${vars.color.border}`,
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const actions = style({
  display: "flex",
  gap: space.s2,
  flexWrap: "wrap",
});
