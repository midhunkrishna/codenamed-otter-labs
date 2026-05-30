/**
 * Global reset + base element styling (Impl-A foundation track).
 *
 * Applies a small reset and base html/body/code/a styling using the frozen
 * `vars` contract so the page picks up whichever theme class is on <html>.
 *
 * NOTE: the self-hosted @fontsource imports do NOT belong here — vanilla-extract
 * drops plain CSS side-effect imports from a `.css.ts` file. They live in the
 * plain module `./fonts.ts`, loaded from `main.tsx`. (invariant 6: no cloud.)
 */
import { globalStyle } from "@vanilla-extract/css";
import { vars } from "./contract.css";
import { space } from "./contract.css";

globalStyle("*, *::before, *::after", {
  boxSizing: "border-box",
});

globalStyle("html, body", {
  margin: 0,
  padding: 0,
});

globalStyle("html", {
  WebkitTextSizeAdjust: "100%",
});

globalStyle("body", {
  background: vars.color.bg,
  color: vars.color.text,
  fontFamily: vars.font.sans,
  fontSize: space.fontSize,
  lineHeight: 1.55,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
});

globalStyle("code, pre, kbd, samp", {
  fontFamily: vars.font.mono,
});

globalStyle("a", {
  color: vars.color.accent,
  textDecoration: "none",
});

globalStyle("a:hover", {
  textDecoration: "underline",
});

globalStyle("h1, h2, h3, h4, p, figure", {
  margin: 0,
});

globalStyle("button", {
  fontFamily: "inherit",
  fontSize: "inherit",
});
