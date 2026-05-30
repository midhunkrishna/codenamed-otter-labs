/**
 * FROZEN CONTRACT (orchestrator-owned, plan 003-design-system).
 *
 * The vanilla-extract theme contracts. These define the *shape* of every
 * themeable variable — the names are frozen. Theme implementations
 * (`design/themes/*.css.ts`) fill these in with concrete values via
 * `createTheme(vars, {...})`; density implementations fill `space`.
 *
 * INVARIANT (MIN-43): components reference ONLY these contract vars (directly
 * or via the semantic accessors in `tokens.ts`). No raw hex/oklch in a
 * component — raw colors live exclusively inside `themes/*.css.ts`.
 *
 * Two independent contracts so theme (palette/chrome) and density (spacing/
 * sizing) compose orthogonally: 4 themes × 3 densities, switched by applying
 * one theme class + one density class to <html> (no remount).
 */
import { createThemeContract } from "@vanilla-extract/css";

/**
 * Palette + chrome + typography + shape. Filled per-theme. Tone names map to
 * the 8 semantic hues from the design language; each has a `*Soft` companion
 * (≈22% alpha fill) used for pill/stripe backgrounds.
 */
export const vars = createThemeContract({
  color: {
    bg: null,
    surface: null,
    surface2: null,
    surface3: null,
    card: null,
    cardHover: null,
    border: null,
    borderStrong: null,
    text: null,
    textMuted: null,
    textFaint: null,
    accent: null,
    accentSoft: null,
    onAccent: null,
    // Owner hues (ownership is a first-class visual property).
    ownerUser: null,
    ownerUserSoft: null,
    ownerAgent: null,
    ownerAgentSoft: null,
    ownerSystem: null,
    ownerSystemSoft: null,
    ownerBlocked: null,
    ownerBlockedSoft: null,
    // 8 status/risk tones + soft companions.
    toneGray: null,
    toneGraySoft: null,
    toneBlue: null,
    toneBlueSoft: null,
    toneAmber: null,
    toneAmberSoft: null,
    toneTeal: null,
    toneTealSoft: null,
    toneViolet: null,
    toneVioletSoft: null,
    toneOrange: null,
    toneOrangeSoft: null,
    toneGreen: null,
    toneGreenSoft: null,
    toneRed: null,
    toneRedSoft: null,
  },
  font: {
    sans: null,
    mono: null,
    serif: null,
  },
  // Type scale (size/line-height/tracking baked into named steps).
  text: {
    display: null,
    h1: null,
    h2: null,
    body: null,
    card: null,
    meta: null,
    eyebrow: null,
    mono: null,
  },
  radius: {
    sm: null,
    base: null,
    pill: null,
    large: null,
    full: null,
  },
  shadow: {
    card: null,
    lift: null,
  },
});

/**
 * Density contract: spacing scale + component sizing that collapses/relaxes
 * as a single root-level choice (compact / regular / comfy). Density is NOT a
 * per-component hack — components read these vars only.
 */
export const space = createThemeContract({
  // 4px base grid steps (values shift slightly per density).
  s1: null,
  s2: null,
  s3: null,
  s4: null,
  s5: null,
  s6: null,
  s7: null,
  s8: null,
  // Semantic spacing the primitives consume.
  cardPadX: null,
  cardPadY: null,
  cardGap: null,
  rowGap: null,
  controlHeight: null,
  controlPadX: null,
  // Base UI font-size (compact shrinks the whole UI).
  fontSize: null,
});
