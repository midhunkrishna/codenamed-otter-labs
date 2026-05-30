import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  paddingBlock: space.s2,
});

export const title = style({
  font: vars.text.h2,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
});

export const tag = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textFaint,
});

export const spacer = style({
  flex: 1,
});

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
});
