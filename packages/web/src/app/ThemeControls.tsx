import { useDensity, useTheme } from "../design";
import {
  DENSITIES,
  THEMES,
  type Density,
  type ThemeName,
} from "../design/tokens";
import * as css from "./ThemeControls.css";

/** Display labels for the 4 themes (kept here — tokens.ts is frozen). */
const THEME_LABELS: Record<ThemeName, string> = {
  linear: "Linear",
  notion: "Notion",
  jira: "Jira",
  celebration: "Celebration",
};

/** Display labels for the 3 densities. */
const DENSITY_LABELS: Record<Density, string> = {
  compact: "Compact",
  regular: "Regular",
  comfy: "Comfy",
};

/**
 * Theme + density pickers wired to the foundation's `useTheme` / `useDensity`.
 * Switching either swaps a class on <html> with NO React remount (the provider
 * handles that), so this is the in-UI surfacing of the acceptance criterion
 * "themes/densities selectable programmatically". Reused by the app shell and
 * the /preview Components route.
 */
export function ThemeControls({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();

  return (
    <div className={[css.root, className].filter(Boolean).join(" ")}>
      <label className={css.field}>
        <span className={css.label}>Theme</span>
        <select
          className={css.select}
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeName)}
        >
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {THEME_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={css.field}>
        <span className={css.label}>Density</span>
        <select
          className={css.select}
          aria-label="Density"
          value={density}
          onChange={(e) => setDensity(e.target.value as Density)}
        >
          {DENSITIES.map((d) => (
            <option key={d} value={d}>
              {DENSITY_LABELS[d]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
