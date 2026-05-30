import type { CardProps } from "./types";
import { ownerTone, statusTone } from "../design/tokens";
import { inlineVars } from "./tone";
import * as styles from "./Card.css";

/**
 * Card — the atom of the design language.
 *
 * - `owner` paints a left inset ownership stripe (warm=user, cool=agent,
 *   amber=blocked, neutral=system). When `blockReason` is present the stripe
 *   shifts amber regardless of owner (per the language).
 * - `tone` (lifecycle status) tints the border via the status tone's soft fill.
 * - `blockReason` renders a full-width amber block banner across the top.
 * - `interactive` / `onClick` make the card a hover-lifting button-like surface.
 *
 * Dynamic per-instance colors are applied through CSS custom properties
 * (declared via `createVar()` in Card.css.ts), never raw literals.
 */
export function Card({
  owner,
  tone,
  blockReason,
  interactive,
  onClick,
  className,
  children,
}: CardProps) {
  const blocked = blockReason != null && blockReason !== false;
  const isInteractive = interactive || onClick != null;

  const cssVars: Record<string, string> = {};
  const classes = [styles.card];

  // Ownership stripe (amber when blocked).
  if (owner || blocked) {
    const stripe = blocked ? ownerTone.blocked : ownerTone[owner ?? "system"];
    cssVars[styles.stripeColor] = stripe.fg;
    classes.push(styles.owned);
  }

  // Status tone accent.
  if (tone) {
    const t = statusTone[tone];
    cssVars[styles.toneFg] = t.fg;
    cssVars[styles.toneSoft] = t.soft;
    classes.push(styles.toned);
  }

  if (isInteractive) classes.push(styles.interactive);
  if (className) classes.push(className);

  return (
    <div
      className={classes.join(" ")}
      style={inlineVars(cssVars)}
      data-owner={blocked ? "blocked" : owner}
      data-tone={tone}
      data-blocked={blocked || undefined}
      onClick={onClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {blocked ? (
        <div className={styles.blockStripe} data-testid="card-block-stripe">
          {blockReason}
        </div>
      ) : null}
      {children}
    </div>
  );
}
