import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const empty = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  gap: space.s2,
  padding: space.s6,
  color: vars.color.textMuted,
});

export const icon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.textFaint,
  fontSize: "1.75em",
  marginBottom: space.s1,
});

export const title = style({
  font: vars.text.h2,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  color: vars.color.text,
  margin: 0,
});

export const description = style({
  font: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  maxWidth: "40ch",
});

export const action = style({
  marginTop: space.s2,
});
