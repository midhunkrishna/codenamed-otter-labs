import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
});

export const controls = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s4,
  alignItems: "flex-end",
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: space.rowGap,
});

export const grid = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: space.cardGap,
  alignItems: "start",
});

export const specimen = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  padding: space.cardPadY + " " + space.cardPadX,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
});

export const specimenLabel = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textMuted,
});

export const inlineRow = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s2,
  alignItems: "center",
});

export const shellFrame = style({
  height: 320,
  borderRadius: vars.radius.large,
  border: `1px solid ${vars.color.border}`,
  overflow: "hidden",
});
