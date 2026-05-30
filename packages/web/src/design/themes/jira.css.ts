/**
 * Jira theme — dense, light, sharper corners. Anchored to:
 *   bg #f4f5f7, surface2 #ebecf0, card #ffffff, accent #0052cc, text #172b4d.
 *   radius base/pill/large all 3px (sharp, businesslike).
 * Remaining palette derived: cool grey-blue surfaces, slate borders, muted
 * slate text, white onAccent. Tones nudged to Atlassian-ish hues but kept
 * semantically identical.
 *
 * Raw colors allowed here (theme file).
 */
import { createTheme } from "@vanilla-extract/css";
import { vars } from "../contract.css";

export const jiraTheme = createTheme(vars, {
  color: {
    bg: "#f4f5f7",
    surface: "#fafbfc",
    surface2: "#ebecf0",
    surface3: "#dfe1e6",
    card: "#ffffff",
    cardHover: "#f4f5f7",
    border: "rgba(9,30,66,.13)",
    borderStrong: "rgba(9,30,66,.25)",
    text: "#172b4d",
    textMuted: "#5e6c84",
    textFaint: "#8993a4",
    accent: "#0052cc",
    accentSoft: "rgba(0,82,204,.12)",
    onAccent: "#ffffff",
    // Owner hues, tuned for a cool light bg.
    ownerUser: "oklch(0.60 0.17 50)",
    ownerUserSoft: "oklch(0.60 0.17 50 / .14)",
    ownerAgent: "oklch(0.52 0.18 260)",
    ownerAgentSoft: "oklch(0.52 0.18 260 / .14)",
    ownerSystem: "#5e6c84",
    ownerSystemSoft: "rgba(94,108,132,.14)",
    ownerBlocked: "oklch(0.64 0.15 80)",
    ownerBlockedSoft: "oklch(0.64 0.15 80 / .16)",
    // 8 tones.
    toneGray: "#5e6c84",
    toneGraySoft: "rgba(94,108,132,.14)",
    toneBlue: "#0052cc",
    toneBlueSoft: "rgba(0,82,204,.13)",
    toneAmber: "#ff8b00",
    toneAmberSoft: "rgba(255,139,0,.16)",
    toneTeal: "#00a3bf",
    toneTealSoft: "rgba(0,163,191,.14)",
    toneViolet: "#6554c0",
    toneVioletSoft: "rgba(101,84,192,.14)",
    toneOrange: "#ff5630",
    toneOrangeSoft: "rgba(255,86,48,.14)",
    toneGreen: "#00875a",
    toneGreenSoft: "rgba(0,135,90,.15)",
    toneRed: "#de350b",
    toneRedSoft: "rgba(222,53,11,.13)",
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
    sm: "3px",
    base: "3px",
    pill: "3px",
    large: "3px",
    full: "999px",
  },
  shadow: {
    card: "0 1px 1px rgba(9,30,66,.1), 0 0 1px rgba(9,30,66,.13)",
    lift: "0 8px 16px rgba(9,30,66,.18)",
  },
});
