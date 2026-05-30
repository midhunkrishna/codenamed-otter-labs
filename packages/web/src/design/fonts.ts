/**
 * Self-hosted font registration (no cloud, no extracted files — invariant 6).
 *
 * These MUST live in a plain `.ts` module, NOT in `global.css.ts`: the
 * vanilla-extract compiler evaluates a `.css.ts` file in isolation to extract
 * only its own styles and DROPS plain `import "*.css"` side-effects, so the
 * @fontsource @font-face rules + woff2 assets never reach the bundle. Imported
 * from `main.tsx` (a normal module), vite bundles them correctly.
 */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
