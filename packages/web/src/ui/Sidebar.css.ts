import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const sidebar = style({
  display: "flex",
  flexDirection: "column",
  width: 248,
  height: "100%",
  paddingBlock: space.s3,
  borderInlineEnd: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  overflowY: "auto",
});

export const collapsed = style({
  width: 56,
});

export const brand = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  paddingInline: space.s3,
  paddingBlock: space.s2,
  font: vars.text.h2,
  fontFamily: vars.font.sans,
  fontWeight: 700,
});

export const sections = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s4,
  flex: 1,
  marginTop: space.s3,
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
});

export const sectionTitle = style({
  paddingInline: space.s3,
  marginBottom: space.s1,
  font: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: vars.color.textFaint,
});

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  width: "100%",
  marginInline: "auto",
  paddingInline: space.s3,
  height: space.controlHeight,
  border: "none",
  background: "transparent",
  borderRadius: vars.radius.base,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  cursor: "pointer",
  textAlign: "left",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surface2,
      color: vars.color.text,
    },
  },
});

export const itemActive = style({
  backgroundColor: vars.color.surface2,
  color: vars.color.text,
  fontWeight: 600,
});

export const itemLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const icon = style({
  display: "inline-flex",
  flex: "0 0 auto",
  alignItems: "center",
  justifyContent: "center",
});

export const footer = style({
  marginTop: "auto",
  paddingTop: space.s3,
  paddingInline: space.s3,
});
