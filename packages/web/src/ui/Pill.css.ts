import { createVar, style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/** Per-instance tone vars, set inline from the resolved ToneSelector. */
export const toneFg = createVar();
export const toneSoft = createVar();

export const pill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  paddingInline: space.s2,
  paddingBlock: space.s1,
  borderRadius: vars.radius.pill,
  font: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: "nowrap",
  color: toneFg,
  backgroundColor: toneSoft,
});
