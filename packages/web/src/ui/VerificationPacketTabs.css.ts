import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s3,
});

export const tablist = style({
  display: "flex",
  gap: space.s1,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const tab = style({
  appearance: "none",
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  padding: `${space.s2} ${space.s3}`,
  marginBottom: -1,
  cursor: "pointer",
  font: "inherit",
  fontFamily: vars.font.sans,
  fontSize: vars.text.body,
  fontWeight: 600,
  color: vars.color.textMuted,
  selectors: {
    "&:hover": { color: vars.color.text },
  },
});

export const tabActive = style({
  color: vars.color.accent,
  borderBottomColor: vars.color.accent,
});

export const panel = style({
  fontFamily: vars.font.sans,
  fontSize: vars.text.body,
  color: vars.color.text,
});
