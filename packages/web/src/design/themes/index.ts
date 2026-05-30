/**
 * Theme registry (Impl-A foundation track). Maps each ThemeName to the
 * vanilla-extract class produced by its `createTheme(vars, …)` call. The
 * ThemeProvider applies `themeClasses[theme]` to <html>.
 *
 * Adding a theme = add a `*.css.ts` file + one entry here.
 */
import type { ThemeName } from "../tokens";
import { linearTheme } from "./linear.css";
import { notionTheme } from "./notion.css";
import { jiraTheme } from "./jira.css";
import { celebrationTheme } from "./celebration.css";

export const themeClasses: Record<ThemeName, string> = {
  linear: linearTheme,
  notion: notionTheme,
  jira: jiraTheme,
  celebration: celebrationTheme,
};

export { linearTheme, notionTheme, jiraTheme, celebrationTheme };
