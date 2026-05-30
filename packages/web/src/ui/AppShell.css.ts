import { style } from "@vanilla-extract/css";
import { vars } from "../design/contract.css";

export const shell = style({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gridTemplateRows: "100%",
  height: "100vh",
  width: "100%",
  backgroundColor: vars.color.bg,
  color: vars.color.text,
  fontFamily: vars.font.sans,
});

export const main = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  minWidth: 0,
  minHeight: 0,
});

export const topbar = style({
  display: "flex",
  alignItems: "center",
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.surface,
});

export const content = style({
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
});
