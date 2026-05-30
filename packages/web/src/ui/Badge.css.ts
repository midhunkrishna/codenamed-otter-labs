import { createVar, style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/** Per-instance tone vars, set inline from the resolved ToneSelector. */
export const toneFg = createVar();
export const toneSoft = createVar();

export const badge = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space.s1,
  paddingInline: space.s2,
  paddingBlock: space.s1,
  borderRadius: vars.radius.sm,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap",
  color: toneFg,
  backgroundColor: toneSoft,
});

/** Numeric count variant: pill-shaped, fixed min-width for single digits. */
export const count = style({
  minWidth: "1.5em",
  paddingInline: space.s1,
  borderRadius: vars.radius.full,
  fontVariantNumeric: "tabular-nums",
});
