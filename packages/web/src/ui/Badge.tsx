import type { BadgeProps } from "./types";
import { inlineVars, resolveTone } from "./tone";
import * as styles from "./Badge.css";

/**
 * Small tone chip. With `count` it becomes a numeric count badge (count value
 * takes precedence over children). Tone resolved + applied via per-instance
 * CSS custom properties (no raw colors).
 */
export function Badge({ tone, count, className, children }: BadgeProps) {
  const resolved = resolveTone(tone);
  const isCount = count !== undefined;
  const cls = [styles.badge, isCount ? styles.count : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={cls}
      data-tone={tone ?? "neutral"}
      style={inlineVars({
        [styles.toneFg]: resolved.fg,
        [styles.toneSoft]: resolved.soft,
      })}
    >
      {isCount ? count : children}
    </span>
  );
}
