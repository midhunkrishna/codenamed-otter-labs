import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s3,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.cardPadY,
  paddingBottom: space.cardPadY,
  background: vars.color.card,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.base,
  color: vars.color.text,
});

export const head = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: space.s2,
});

export const lede = style({
  fontSize: vars.text.body,
  fontFamily: vars.font.sans,
  margin: 0,
  color: vars.color.text,
});

export const actor = style({
  fontWeight: 700,
});

export const intent = style({
  color: vars.color.textMuted,
});

export const actions = style({
  display: "flex",
  gap: space.s2,
  flexWrap: "wrap",
});
