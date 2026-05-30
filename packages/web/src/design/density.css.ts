/**
 * Density (Impl-A foundation track). Three `createTheme(space, …)` classes that
 * fill the frozen `space` contract. Density is a single root-level choice — the
 * ThemeProvider applies `densityClasses[density]` to <html> alongside the theme
 * class, so spacing/sizing recascade orthogonally to palette.
 *
 *   regular = the design baseline (4px grid).
 *   compact ≈ 0.85× (tighter, fontSize 13).
 *   comfy   ≈ 1.15× (roomier, fontSize 15).
 *
 * Values are deliberately distinct so density-switch tests can assert the vars
 * changed on the same root element.
 */
import { createTheme } from "@vanilla-extract/css";
import type { Density } from "./tokens";
import { space } from "./contract.css";

const regularSpace = createTheme(space, {
  s1: "4px",
  s2: "8px",
  s3: "12px",
  s4: "16px",
  s5: "24px",
  s6: "32px",
  s7: "48px",
  s8: "64px",
  cardPadX: "12px",
  cardPadY: "10px",
  cardGap: "9px",
  rowGap: "9px",
  controlHeight: "28px",
  controlPadX: "12px",
  fontSize: "14px",
});

const compactSpace = createTheme(space, {
  s1: "3px",
  s2: "6px",
  s3: "10px",
  s4: "14px",
  s5: "20px",
  s6: "28px",
  s7: "40px",
  s8: "54px",
  cardPadX: "10px",
  cardPadY: "7px",
  cardGap: "7px",
  rowGap: "6px",
  controlHeight: "24px",
  controlPadX: "10px",
  fontSize: "13px",
});

const comfySpace = createTheme(space, {
  s1: "5px",
  s2: "10px",
  s3: "14px",
  s4: "18px",
  s5: "28px",
  s6: "38px",
  s7: "56px",
  s8: "74px",
  cardPadX: "16px",
  cardPadY: "14px",
  cardGap: "12px",
  rowGap: "12px",
  controlHeight: "34px",
  controlPadX: "16px",
  fontSize: "15px",
});

export const densityClasses: Record<Density, string> = {
  compact: compactSpace,
  regular: regularSpace,
  comfy: comfySpace,
};

export { compactSpace, regularSpace, comfySpace };
