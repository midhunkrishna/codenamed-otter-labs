import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
});

export const label = style({
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textMuted,
});

export const select = style({
  appearance: "none",
  width: "100%",
  height: space.controlHeight,
  paddingInline: space.controlPadX,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface2,
  color: vars.color.text,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  cursor: "pointer",
  selectors: {
    "&:hover": { borderColor: vars.color.borderStrong },
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});
