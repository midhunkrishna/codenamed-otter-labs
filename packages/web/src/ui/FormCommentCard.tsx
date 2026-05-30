import type { FormCommentCardProps, FormCommentState } from "./types";
import { Pill } from "./Pill";
import * as css from "./FormCommentCard.css";

const STATE_LABEL: Record<FormCommentState, string> = {
  open: "Open",
  submitted: "Submitted",
  dismissed: "Dismissed",
  expired: "Expired",
  superseded: "Superseded",
};

/**
 * Agent-asks form comment. While `state==='open'` and `blocking`, it surfaces a
 * bright red "Blocks ticket" pill (risk.critical tone — the brightest red in
 * the tone palette). Renders the questions (`children`) + a `footer` (submit
 * actions). Resolved states render muted.
 */
export function FormCommentCard({
  author,
  state,
  blocking,
  children,
  footer,
  className,
}: FormCommentCardProps) {
  const open = state === "open";
  const showBlocking = blocking && open;
  return (
    <div
      className={[css.root, open ? "" : css.resolved, className]
        .filter(Boolean)
        .join(" ")}
      data-form-state={state}
      data-blocking={showBlocking ? "true" : undefined}
    >
      <div className={css.head}>
        <span className={css.eyebrow}>Agent asks</span>
        <span className={css.author}>{author}</span>
        {showBlocking && (
          <span data-blocks-ticket>
            <Pill tone="risk.critical">Blocks ticket</Pill>
          </span>
        )}
        <span className={css.stateTag}>{STATE_LABEL[state]}</span>
      </div>

      {children && (
        <div className={css.body} data-form-body>
          {children}
        </div>
      )}

      {footer && (
        <div className={css.footer} data-form-footer>
          {footer}
        </div>
      )}
    </div>
  );
}
