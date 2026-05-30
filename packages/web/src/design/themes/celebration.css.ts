/**
 * Celebration theme — playful, light, expressive serif. Anchored to:
 *   bg #fff9f0, surface2 #fff4e0, card #ffffff, accent #e83a8a, text #3a1f4a.
 *   radius base 16px, large 20px, pill 999px (soft, rounded, joyful).
 * Judgement call (documented): the design directive says use Fraunces where it
 * reads as "expressive". We set `font.sans` = Fraunces so headings + UI chrome
 * feel editorial/playful, keep `font.mono` = JetBrains Mono for code, and keep
 * `font.serif` = Fraunces. Body text inherits the serif sans, which is the
 * visibly-playful signal this theme is meant to give.
 *
 * Raw colors allowed here (theme file).
 */
import { createTheme } from "@vanilla-extract/css";
import { vars } from "../contract.css";

export const celebrationTheme = createTheme(vars, {
  color: {
    bg: "#fff9f0",
    surface: "#fffaf3",
    surface2: "#fff4e0",
    surface3: "#ffedd0",
    card: "#ffffff",
    cardHover: "#fff6ea",
    border: "rgba(58,31,74,.10)",
    borderStrong: "rgba(58,31,74,.20)",
    text: "#3a1f4a",
    textMuted: "#7a5a86",
    textFaint: "#a98fb0",
    accent: "#e83a8a",
    accentSoft: "rgba(232,58,138,.14)",
    onAccent: "#ffffff",
    // Owner hues, brighter/saturated to match the playful mood.
    ownerUser: "oklch(0.70 0.20 40)",
    ownerUserSoft: "oklch(0.70 0.20 40 / .16)",
    ownerAgent: "oklch(0.62 0.20 290)",
    ownerAgentSoft: "oklch(0.62 0.20 290 / .16)",
    ownerSystem: "#7a5a86",
    ownerSystemSoft: "rgba(122,90,134,.14)",
    ownerBlocked: "oklch(0.74 0.17 75)",
    ownerBlockedSoft: "oklch(0.74 0.17 75 / .18)",
    // 8 tones — same semantics, candy-bright.
    toneGray: "#7a5a86",
    toneGraySoft: "rgba(122,90,134,.14)",
    toneBlue: "#3b82f6",
    toneBlueSoft: "rgba(59,130,246,.15)",
    toneAmber: "#f59e0b",
    toneAmberSoft: "rgba(245,158,11,.18)",
    toneTeal: "#06b6d4",
    toneTealSoft: "rgba(6,182,212,.16)",
    toneViolet: "#a855f7",
    toneVioletSoft: "rgba(168,85,247,.16)",
    toneOrange: "#fb7185",
    toneOrangeSoft: "rgba(251,113,133,.16)",
    toneGreen: "#10b981",
    toneGreenSoft: "rgba(16,185,129,.16)",
    toneRed: "#ef4444",
    toneRedSoft: "rgba(239,68,68,.15)",
  },
  font: {
    sans: "'Fraunces', Georgia, serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    serif: "'Fraunces', Georgia, serif",
  },
  text: {
    display: "600 52px/1.05",
    h1: "600 34px/1.1",
    h2: "600 20px/1.25",
    body: "400 15px/1.55",
    card: "400 14px/1.4",
    meta: "400 12px/1.4",
    eyebrow: "600 11px/1.4",
    mono: "400 12px/1.4",
  },
  radius: {
    sm: "10px",
    base: "16px",
    pill: "999px",
    large: "20px",
    full: "999px",
  },
  shadow: {
    card: "0 2px 0 rgba(232,58,138,.06), 0 2px 6px rgba(58,31,74,.10)",
    lift: "0 10px 28px rgba(232,58,138,.22)",
  },
});
