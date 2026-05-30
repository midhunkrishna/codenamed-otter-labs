import type { PillProps } from "./types";
import { inlineVars, resolveTone } from "./tone";
import * as styles from "./Pill.css";

/**
 * Small tone chip. Resolves `tone` (a `ToneSelector`) to a `{ fg, soft }` pair
 * and applies it via per-instance CSS custom properties (no raw colors).
 */
export function Pill({ tone, className, children }: PillProps) {
  const resolved = resolveTone(tone);
  const cls = className ? `${styles.pill} ${className}` : styles.pill;
  return (
    <span
      className={cls}
      data-tone={tone ?? "neutral"}
      style={inlineVars({
        [styles.toneFg]: resolved.fg,
        [styles.toneSoft]: resolved.soft,
      })}
    >
      {children}
    </span>
  );
}
