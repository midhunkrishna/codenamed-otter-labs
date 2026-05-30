import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

export const root = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  paddingLeft: space.cardPadX,
  paddingRight: space.cardPadX,
  paddingTop: space.cardPadY,
  paddingBottom: space.cardPadY,
  background: vars.color.card,
  border: `1px solid ${vars.color.border}`,
  borderLeftWidth: 3,
  borderRadius: vars.radius.base,
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

export const sticky = style({
  position: "sticky",
  top: space.s2,
  boxShadow: vars.shadow.lift,
});

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: space.s2,
  flexWrap: "wrap",
});

export const typeTag = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  paddingLeft: space.s2,
  paddingRight: space.s2,
  paddingTop: 2,
  paddingBottom: 2,
  borderRadius: vars.radius.pill,
  fontSize: vars.text.eyebrow,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});

export const priorityTag = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space.s1,
  fontSize: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 600,
});

export const ticketKey = style({
  marginLeft: "auto",
  fontFamily: vars.font.mono,
  fontSize: vars.text.meta,
  color: vars.color.textMuted,
});

export const title = style({
  fontSize: vars.text.card,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  margin: 0,
  color: vars.color.text,
});

export const summary = style({
  fontSize: vars.text.body,
  fontFamily: vars.font.sans,
  color: vars.color.textMuted,
  margin: 0,
});

export const requiredAction = style({
  fontSize: vars.text.meta,
  fontFamily: vars.font.sans,
  fontWeight: 600,
  color: vars.color.text,
});

export const body = style({
  marginTop: space.s2,
  paddingTop: space.s2,
  borderTop: `1px solid ${vars.color.border}`,
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
});
