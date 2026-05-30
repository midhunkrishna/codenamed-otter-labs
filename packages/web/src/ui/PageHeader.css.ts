import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const header = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: space.s4,
  paddingInline: space.cardPadX,
  paddingBlock: space.cardPadY,
});

export const titleBlock = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  minWidth: 0,
});

export const eyebrow = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textFaint,
});

export const title = style({
  font: vars.text.h1,
  fontFamily: vars.font.sans,
  fontWeight: 700,
  color: vars.color.text,
  margin: 0,
});

export const description = style({
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
});

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  flex: "0 0 auto",
});
