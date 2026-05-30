import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const tablist = style({
  display: "flex",
  alignItems: "center",
  gap: space.s1,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const tab = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  paddingInline: space.s3,
  height: space.controlHeight,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  cursor: "pointer",
  borderBottom: `2px solid transparent`,
  marginBottom: "-1px",
  selectors: {
    "&:hover": { color: vars.color.text },
  },
});

export const tabActive = style({
  color: vars.color.text,
  fontWeight: 600,
  borderBottomColor: vars.color.accent,
});
