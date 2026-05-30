import { createVar, style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/** Owner-stripe color (resolved from `owner`, or amber when blocked). */
export const stripeColor = createVar();
/** Status-tone accent (resolved from `tone`); drives a subtle accent line. */
export const toneFg = createVar();
export const toneSoft = createVar();

export const card = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
  padding: `${space.cardPadY} ${space.cardPadX}`,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.card,
  boxShadow: vars.shadow.card,
  color: vars.color.text,
  overflow: "hidden",
});

/** Left inset ownership stripe (warm=user / cool=agent / amber=blocked). */
export const owned = style({
  selectors: {
    "&::before": {
      content: "",
      position: "absolute",
      insetBlock: 0,
      insetInlineStart: 0,
      width: space.s1,
      backgroundColor: stripeColor,
    },
  },
});

/** When a status tone is present, paint a hairline accent under the border. */
export const toned = style({
  borderColor: toneSoft,
});

export const interactive = style({
  cursor: "pointer",
  transitionProperty: "background-color, box-shadow, border-color",
  transitionDuration: "120ms",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.cardHover,
      boxShadow: vars.shadow.lift,
      borderColor: vars.color.borderStrong,
    },
  },
});

/** Full-width amber block banner across the top of the card. */
export const blockStripe = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  marginInline: `calc(-1 * ${space.cardPadX})`,
  marginTop: `calc(-1 * ${space.cardPadY})`,
  marginBottom: space.s1,
  paddingInline: space.cardPadX,
  paddingBlock: space.s2,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  color: vars.color.ownerBlocked,
  backgroundColor: vars.color.ownerBlockedSoft,
});
