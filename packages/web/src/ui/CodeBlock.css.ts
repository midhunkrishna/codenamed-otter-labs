import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const block = style({
  display: "block",
  padding: space.s3,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface2,
  color: vars.color.text,
  font: vars.text.mono,
  fontFamily: vars.font.mono,
  whiteSpace: "pre-wrap",
  overflowX: "auto",
  margin: 0,
});

export const inline = style({
  display: "inline",
  padding: `0 ${space.s1}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface2,
  color: vars.color.text,
  fontFamily: vars.font.mono,
  font: vars.text.mono,
  whiteSpace: "pre",
});
