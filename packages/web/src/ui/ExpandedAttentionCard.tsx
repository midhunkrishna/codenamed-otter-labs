import type { CSSProperties } from "react";
import { attentionTone } from "../design/tokens";
import type { ExpandedAttentionCardProps } from "./types";
import { AttentionHeader } from "./AttentionCard";
import * as css from "./ExpandedAttentionCard.css";

/**
 * Expanded attention card: same header as the collapsed AttentionCard plus a
 * source-specific body (`children`) for permission/plan/question/verification
 * detail. `sticky` keeps it pinned while the user is acting on it.
 */
export function ExpandedAttentionCard({
  type,
  priority,
  title,
  summary,
  requiredAction,
  ticketKey,
  sticky,
  children,
  className,
}: ExpandedAttentionCardProps) {
  const aTone = attentionTone[type];
  return (
    <div
      className={[css.root, sticky ? css.sticky : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{ borderLeftColor: aTone.fg } as CSSProperties}
      data-attention-type={type}
      data-priority={priority}
      data-sticky={sticky ? "true" : undefined}
    >
      <AttentionHeader
        type={type}
        priority={priority}
        title={title}
        summary={summary}
        requiredAction={requiredAction}
        ticketKey={ticketKey}
      />
      {children && (
        <div className={css.body} data-expanded-body>
          {children}
        </div>
      )}
    </div>
  );
}
