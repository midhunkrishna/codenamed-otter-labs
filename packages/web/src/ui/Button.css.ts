import { style, styleVariants } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const base = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space.s2,
  height: space.controlHeight,
  paddingInline: space.controlPadX,
  borderRadius: vars.radius.base,
  border: `1px solid transparent`,
  font: vars.text.body,
  fontFamily: vars.font.sans,
  fontWeight: 500,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
  userSelect: "none",
  transitionProperty: "background-color, border-color, color, box-shadow",
  transitionDuration: "120ms",
  selectors: {
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.5,
    },
  },
});

export const variant = styleVariants({
  primary: {
    backgroundColor: vars.color.accent,
    color: vars.color.onAccent,
    borderColor: vars.color.accent,
    selectors: {
      "&:not(:disabled):hover": { boxShadow: vars.shadow.lift },
    },
  },
  default: {
    backgroundColor: vars.color.surface2,
    color: vars.color.text,
    borderColor: vars.color.border,
    selectors: {
      "&:not(:disabled):hover": {
        backgroundColor: vars.color.surface3,
        borderColor: vars.color.borderStrong,
      },
    },
  },
  danger: {
    backgroundColor: vars.color.toneRed,
    color: vars.color.onAccent,
    borderColor: vars.color.toneRed,
    selectors: {
      "&:not(:disabled):hover": { boxShadow: vars.shadow.lift },
    },
  },
  ghost: {
    backgroundColor: "transparent",
    color: vars.color.textMuted,
    borderColor: "transparent",
    selectors: {
      "&:not(:disabled):hover": {
        backgroundColor: vars.color.surface2,
        color: vars.color.text,
      },
    },
  },
});
