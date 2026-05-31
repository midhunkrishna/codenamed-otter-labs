import { style } from "@vanilla-extract/css";
import { space, vars } from "../design/contract.css";

/** Bare title button so the card title doubles as the expand/collapse toggle
 * while staying visually identical to the static heading. */
export const titleButton = style({
  appearance: "none",
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
});

/** Action row for stubbed (deferred) source-specific buttons. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s2,
});

/** Footer with the generic Collapse / Dismiss / Mark-resolved affordances. */
export const footer = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space.s2,
  marginTop: space.s2,
  paddingTop: space.s2,
  borderTop: `1px solid ${vars.color.border}`,
});

/** Send-back-with-feedback form inside the plan body. */
export const feedback = style({
  display: "flex",
  flexDirection: "column",
  gap: space.s2,
  marginTop: space.s2,
});

export const textarea = style({
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  padding: space.s2,
  borderRadius: vars.radius.base,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.surface,
  color: vars.color.text,
  fontFamily: vars.font.sans,
  fontSize: vars.text.body,
});

/** The always-present link to the full ticket / run / source. */
export const link = style({
  display: "inline-block",
  fontFamily: vars.font.sans,
  fontSize: vars.text.meta,
  fontWeight: 600,
  color: vars.color.accent,
  textDecoration: "none",
  selectors: {
    "&:hover": { textDecoration: "underline" },
  },
});

/** "Action available when <theme> ships" deferred note. */
export const note = style({
  margin: 0,
  fontFamily: vars.font.sans,
  fontSize: vars.text.meta,
  color: vars.color.textMuted,
  fontStyle: "italic",
});

/** Failure summary line (execution_failed). */
export const summaryLine = style({
  margin: 0,
  fontFamily: vars.font.sans,
  fontSize: vars.text.body,
  color: vars.color.text,
});

/** Inline action error surfaced after a failed live mutation. */
export const error = style({
  margin: 0,
  fontFamily: vars.font.sans,
  fontSize: vars.text.meta,
  fontWeight: 600,
  color: vars.color.toneRed,
});
