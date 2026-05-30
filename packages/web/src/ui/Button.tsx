import type { ButtonProps } from "./types";
import * as styles from "./Button.css";

/**
 * Button primitive. Variants primary/default/danger/ghost; sizing from the
 * density `space.controlHeight` / `space.controlPadX` so it compacts with the
 * root density. No raw colors — accent/red/chrome come from contract vars.
 */
export function Button({
  variant = "default",
  type = "button",
  disabled,
  onClick,
  className,
  children,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const cls = [styles.base, styles.variant[variant], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      data-variant={variant}
    >
      {children}
    </button>
  );
}
