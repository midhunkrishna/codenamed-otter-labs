/**
 * Linear theme — dark, the default. The reference implementation of the design
 * language: every other theme mirrors this token shape with different values.
 *
 * Raw colors / oklch / rgba literals are ALLOWED here (and only here +
 * sibling theme files). Components consume `vars` from contract.css.ts only.
 *
 * Representation choices (documented for the orchestrator):
 *   - `text.*` steps are CSS `font` shorthand strings ("weight size/line-height")
 *     so a primitive can apply one step with a single `font:` declaration.
 *   - `*Soft` tones are the same hue at ~14–22% alpha (rgba/oklch alpha form).
 */
import { createTheme } from "@vanilla-extract/css";
import { vars } from "../contract.css";

export const linearTheme = createTheme(vars, {
  color: {
    bg: "#08090a",
    surface: "#0f1011",
    surface2: "#16181c",
    surface3: "#1c1e22",
    card: "#121316",
    cardHover: "#191b1f",
    border: "rgba(255,255,255,.07)",
    borderStrong: "rgba(255,255,255,.14)",
    text: "#e6e6e8",
    textMuted: "#8a8f98",
    textFaint: "#5d6068",
    accent: "#7170ff",
    accentSoft: "rgba(113,112,255,.14)",
    onAccent: "#ffffff",
    // Owner hues.
    ownerUser: "oklch(0.72 0.18 50)",
    ownerUserSoft: "oklch(0.72 0.18 50 / .18)",
    ownerAgent: "oklch(0.65 0.18 260)",
    ownerAgentSoft: "oklch(0.65 0.18 260 / .18)",
    ownerSystem: "#8a8f98",
    ownerSystemSoft: "rgba(138,143,152,.18)",
    ownerBlocked: "oklch(0.78 0.16 80)",
    ownerBlockedSoft: "oklch(0.78 0.16 80 / .18)",
    // 8 status/risk tones + soft companions (~18% alpha).
    toneGray: "#8a8f98",
    toneGraySoft: "rgba(138,143,152,.18)",
    toneBlue: "#3b82f6",
    toneBlueSoft: "rgba(59,130,246,.18)",
    toneAmber: "#f59e0b",
    toneAmberSoft: "rgba(245,158,11,.18)",
    toneTeal: "#14b8a6",
    toneTealSoft: "rgba(20,184,166,.18)",
    toneViolet: "#8b5cf6",
    toneVioletSoft: "rgba(139,92,246,.18)",
    toneOrange: "#f76b15",
    toneOrangeSoft: "rgba(247,107,21,.18)",
    toneGreen: "#2e7d6b",
    toneGreenSoft: "rgba(46,125,107,.20)",
    toneRed: "#e5484d",
    toneRedSoft: "rgba(229,72,77,.18)",
  },
  font: {
    sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    serif: "'Fraunces', Georgia, serif",
  },
  text: {
    display: "600 48px/1.05",
    h1: "600 32px/1.1",
    h2: "600 19px/1.25",
    body: "400 14px/1.55",
    card: "400 13px/1.4",
    meta: "400 11.5px/1.4",
    eyebrow: "600 10.5px/1.4",
    mono: "400 11.5px/1.4",
  },
  radius: {
    sm: "4px",
    base: "6px",
    pill: "4px",
    large: "10px",
    full: "999px",
  },
  shadow: {
    card: "0 1px 0 rgba(255,255,255,.04), 0 1px 2px rgba(0,0,0,.3)",
    lift: "0 8px 24px rgba(0,0,0,.4)",
  },
});
