/**
 * Notion theme — warm, light. Anchored to the design directives:
 *   bg #ffffff, surface2 #f5f3ee, card #fbfaf7, accent #2e7d6b, text #37352f.
 * Remaining palette derived: warm off-whites for surfaces, dark-on-light
 * borders, muted-brown text for muted/faint, white onAccent. The 8 semantic
 * tones keep their hues; `*Soft` alphas raised slightly (≈14–16%) so fills read
 * on a light background.
 *
 * Raw colors allowed here (theme file). Light themes are intentionally less
 * refined than Linear but complete + selectable.
 */
import { createTheme } from "@vanilla-extract/css";
import { vars } from "../contract.css";

export const notionTheme = createTheme(vars, {
  color: {
    bg: "#ffffff",
    surface: "#faf9f6",
    surface2: "#f5f3ee",
    surface3: "#efece4",
    card: "#fbfaf7",
    cardHover: "#f3f1ea",
    border: "rgba(0,0,0,.08)",
    borderStrong: "rgba(0,0,0,.16)",
    text: "#37352f",
    textMuted: "#73726c",
    textFaint: "#9b9a92",
    accent: "#2e7d6b",
    accentSoft: "rgba(46,125,107,.14)",
    onAccent: "#ffffff",
    // Owner hues (slightly darker oklch lightness so they read on white).
    ownerUser: "oklch(0.62 0.17 50)",
    ownerUserSoft: "oklch(0.62 0.17 50 / .14)",
    ownerAgent: "oklch(0.55 0.17 260)",
    ownerAgentSoft: "oklch(0.55 0.17 260 / .14)",
    ownerSystem: "#73726c",
    ownerSystemSoft: "rgba(115,114,108,.14)",
    ownerBlocked: "oklch(0.66 0.15 80)",
    ownerBlockedSoft: "oklch(0.66 0.15 80 / .16)",
    // 8 tones, hues preserved, fills tuned for light bg.
    toneGray: "#73726c",
    toneGraySoft: "rgba(115,114,108,.14)",
    toneBlue: "#2563eb",
    toneBlueSoft: "rgba(37,99,235,.13)",
    toneAmber: "#d97706",
    toneAmberSoft: "rgba(217,119,6,.15)",
    toneTeal: "#0d9488",
    toneTealSoft: "rgba(13,148,136,.14)",
    toneViolet: "#7c3aed",
    toneVioletSoft: "rgba(124,58,237,.13)",
    toneOrange: "#ea580c",
    toneOrangeSoft: "rgba(234,88,12,.14)",
    toneGreen: "#2e7d6b",
    toneGreenSoft: "rgba(46,125,107,.15)",
    toneRed: "#dc2626",
    toneRedSoft: "rgba(220,38,38,.13)",
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
    card: "0 1px 0 rgba(0,0,0,.02), 0 1px 2px rgba(0,0,0,.06)",
    lift: "0 8px 24px rgba(0,0,0,.12)",
  },
});
