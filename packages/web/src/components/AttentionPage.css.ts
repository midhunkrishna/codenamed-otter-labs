import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/* ── Attention page (sibling filter row + live queue, MIN-37) ──── */

/** The horizontal row of sibling filter chips (All/Permissions/...). */
export const filterRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space.s2,
});

/** A single filter chip — a clickable button reset with a count badge. */
export const filter = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s2,
  padding: space.s1 + " " + space.s3,
  borderRadius: vars.radius.pill,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.card,
  color: vars.color.textMuted,
  font: `${vars.text.meta} ${vars.font.sans}`,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.cardHover },
    "&:focus-visible": { outline: `2px solid ${vars.color.accent}` },
  },
});

/** Active (selected) filter chip. */
export const filterActive = style({
  borderColor: vars.color.accent,
  color: vars.color.text,
  backgroundColor: vars.color.surface2,
});

/** The vertical list of attention item cards. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: space.cardGap,
});

export const errorText = style({
  color: vars.color.toneRed,
  font: `${vars.text.meta} ${vars.font.sans}`,
  margin: 0,
});
