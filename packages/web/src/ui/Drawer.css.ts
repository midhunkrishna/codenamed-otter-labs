import { style, styleVariants } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const overlay = style({
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
});

/**
 * Scrim element behind the panel. Uses the themeable `bg` var at reduced
 * opacity (no raw color literal) so it darkens correctly per theme.
 */
export const scrim = style({
  position: "absolute",
  inset: 0,
  backgroundColor: vars.color.bg,
  opacity: 0.6,
});

export const overlayMode = styleVariants({
  side: { justifyContent: "flex-end" },
  full: { padding: space.s6, alignItems: "stretch", justifyContent: "center" },
});

export const panel = style({
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  boxShadow: vars.shadow.lift,
  overflow: "hidden",
});

export const panelMode = styleVariants({
  side: {
    width: 520,
    maxWidth: "100%",
    height: "100%",
    borderInlineStart: `1px solid ${vars.color.border}`,
  },
  full: {
    width: "100%",
    height: "100%",
    borderRadius: vars.radius.large,
    border: `1px solid ${vars.color.border}`,
  },
});

export const head = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space.s2,
  paddingInline: space.cardPadX,
  paddingBlock: space.s3,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const headTitle = style({
  font: vars.text.h2,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  margin: 0,
});

export const headActions = style({
  display: "flex",
  alignItems: "center",
  gap: space.s1,
});

export const close = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  color: vars.color.textMuted,
  cursor: "pointer",
  fontSize: "1.25em",
  lineHeight: 1,
  padding: space.s1,
  borderRadius: vars.radius.sm,
  selectors: {
    "&:hover": { color: vars.color.text, backgroundColor: vars.color.surface2 },
  },
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: space.cardPadX,
});
