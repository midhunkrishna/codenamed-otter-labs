import { keyframes, style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/** The owner accent stripe down the left edge. Color set inline per owner. */
export const root = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: space.s1,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.cardPadY,
  paddingBottom: space.cardPadY,
  background: vars.color.card,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.base,
  overflow: "hidden",
  textAlign: "left",
  width: "100%",
  font: "inherit",
  color: vars.color.text,
});

export const clickable = style({
  cursor: "pointer",
  selectors: {
    "&:hover": { background: vars.color.cardHover },
  },
});

/** Left owner stripe — 3px accent bar. Color provided inline. */
export const ownerStripe = style({
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 3,
});

/** Amber block banner across the top. */
export const blockStripe = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  marginLeft: `calc(-1 * ${space.cardPadX})`,
  marginRight: `calc(-1 * ${space.cardPadX})`,
  marginTop: `calc(-1 * ${space.cardPadY})`,
  marginBottom: space.s1,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.s1,
  paddingBottom: space.s1,
  background: vars.color.ownerBlockedSoft,
  color: vars.color.ownerBlocked,
  font: `${vars.text.meta} ${vars.font.sans}`,
});

export const phaseChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  alignSelf: "flex-start",
  // `vars.text.eyebrow` is a `font` shorthand (weight/size/line-height); it must
  // be applied via `font:` (with a family) — not `font-size:` — to take effect.
  font: `${vars.text.eyebrow} ${vars.font.sans}`,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});

const pulse = keyframes({
  "0%": { opacity: 0.35, transform: "scale(0.8)" },
  "50%": { opacity: 1, transform: "scale(1.15)" },
  "100%": { opacity: 0.35, transform: "scale(0.8)" },
});

/** The pulsing dot — the ONLY continuous animation, reserved for agent working. */
export const agentDot = style({
  width: 7,
  height: 7,
  borderRadius: vars.radius.full,
  animationName: pulse,
  animationDuration: "1.6s",
  animationTimingFunction: "ease-in-out",
  animationIterationCount: "infinite",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      animationName: "none",
      opacity: 1,
    },
  },
});

export const progressTrack = style({
  height: 3,
  borderRadius: vars.radius.full,
  background: vars.color.surface3,
  overflow: "hidden",
});

export const progressFill = style({
  height: "100%",
  borderRadius: vars.radius.full,
});

export const ticketKey = style({
  // Quiet mono key (reference uses the faint text tone, not muted).
  font: `${vars.text.mono} ${vars.font.mono}`,
  color: vars.color.textFaint,
});

export const title = style({
  // Reference card title is regular weight (400) at the card size — the weight
  // comes from the `card` token, not a 600 override.
  font: `${vars.text.card} ${vars.font.sans}`,
  color: vars.color.text,
  margin: 0,
});

export const pillRow = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s1,
});

export const foot = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space.s2,
  font: `${vars.text.meta} ${vars.font.sans}`,
  color: vars.color.textMuted,
});

export const priority = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
});

export const assignees = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
});
