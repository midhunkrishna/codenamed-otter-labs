import { style, styleVariants } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const grid = style({
  display: "grid",
  gap: space.rowGap,
  width: "100%",
});

export const columns = styleVariants({
  1: { gridTemplateColumns: "1fr" },
  2: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
});

export const fact = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  minWidth: 0,
});

export const label = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textFaint,
});

export const value = style({
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.text,
  minWidth: 0,
  overflowWrap: "anywhere",
});
