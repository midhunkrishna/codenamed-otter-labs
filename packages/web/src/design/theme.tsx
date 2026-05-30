/**
 * ThemeProvider + hooks (Impl-A foundation track).
 *
 * The provider owns the current { theme, density } and, in a useEffect, writes
 * `themeClasses[theme] densityClasses[density]` onto document.documentElement
 * (<html>). Switching theme OR density mutates the class list on the SAME root
 * element — children are never unmounted, so CSS vars recascade with no React
 * remount (invariant: theme/density switch must not remount the app).
 *
 * Consumers:
 *   const { theme, setTheme } = useTheme();
 *   const { density, setDensity } = useDensity();
 *   const ctx = useThemeContext(); // full ThemeContextValue
 * All three throw a clear error when used outside a ThemeProvider.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemeContextValue } from "../ui/types";
import { DEFAULT_DENSITY, DEFAULT_THEME, type Density, type ThemeName } from "./tokens";
import { themeClasses } from "./themes";
import { densityClasses } from "./density.css";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children?: ReactNode;
  defaultTheme?: ThemeName;
  defaultDensity?: Density;
}

/** Compose the root className for a given theme + density. */
export function rootClassName(theme: ThemeName, density: Density): string {
  return `${themeClasses[theme]} ${densityClasses[density]}`;
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  defaultDensity = DEFAULT_DENSITY,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme);
  const [density, setDensity] = useState<Density>(defaultDensity);

  // Apply theme + density classes to <html> on every change. No remount: this
  // only mutates document.documentElement.className; the React tree is stable.
  useEffect(() => {
    const root = document.documentElement;
    root.className = rootClassName(theme, density);
    return () => {
      // Leave the class in place between renders; only clear on full unmount.
    };
  }, [theme, density]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, density, setTheme, setDensity }),
    [theme, density],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContextOrThrow(hook: string): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error(
      `${hook} must be used within a <ThemeProvider>. Wrap your app (or the test) in <ThemeProvider> from "@otter/web design/theme".`,
    );
  }
  return ctx;
}

/** Full context value. */
export function useThemeContext(): ThemeContextValue {
  return useThemeContextOrThrow("useThemeContext");
}

/** Current theme + setter. Throws outside a ThemeProvider. */
export function useTheme(): { theme: ThemeName; setTheme: (t: ThemeName) => void } {
  const ctx = useThemeContextOrThrow("useTheme");
  const setTheme = useCallback((t: ThemeName) => ctx.setTheme(t), [ctx]);
  return { theme: ctx.theme, setTheme };
}

/** Current density + setter. Throws outside a ThemeProvider. */
export function useDensity(): { density: Density; setDensity: (d: Density) => void } {
  const ctx = useThemeContextOrThrow("useDensity");
  const setDensity = useCallback((d: Density) => ctx.setDensity(d), [ctx]);
  return { density: ctx.density, setDensity };
}
