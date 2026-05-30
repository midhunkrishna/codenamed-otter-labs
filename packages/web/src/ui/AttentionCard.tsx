import type { CSSProperties, ReactNode } from "react";
import { attentionTone, ATTENTION_LABELS } from "../design/tokens";
import { vars as contractVars } from "../design/contract.css";
import type { AttentionCardProps, Priority } from "./types";
import * as css from "./AttentionCard.css";

/**
 * Priority → contract tone. No raw colors — these are contract var references
 * (the same vars statusTone/riskTone resolve to), so they stay themeable and
 * pass the raw-color guard.
 */
const priorityTone: Record<Priority, { fg: string; soft: string }> = {
  low: { fg: contractVars.color.toneGray, soft: contractVars.color.toneGraySoft },
  normal: { fg: contractVars.color.toneBlue, soft: contractVars.color.toneBlueSoft },
  high: { fg: contractVars.color.toneOrange, soft: contractVars.color.toneOrangeSoft },
  urgent: { fg: contractVars.color.toneRed, soft: contractVars.color.toneRedSoft },
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** Shared header used by collapsed + expanded variants. */
export function AttentionHeader({
  type,
  priority,
  title,
  summary,
  requiredAction,
  ticketKey,
}: {
  type: AttentionCardProps["type"];
  priority: Priority;
  title: ReactNode;
  summary?: ReactNode;
  requiredAction?: ReactNode;
  ticketKey?: string;
}) {
  const aTone = attentionTone[type];
  const pTone = priorityTone[priority];
  return (
    <>
      <div className={css.header}>
        <span
          className={css.typeTag}
          style={
            { background: aTone.soft, color: aTone.fg } as CSSProperties
          }
          data-attention-type={type}
        >
          {ATTENTION_LABELS[type]}
        </span>
        <span
          className={css.priorityTag}
          style={{ color: pTone.fg } as CSSProperties}
          data-priority={priority}
        >
          {PRIORITY_LABELS[priority]}
        </span>
        {ticketKey && <span className={css.ticketKey}>{ticketKey}</span>}
      </div>
      <h3 className={css.title}>{title}</h3>
      {summary && <p className={css.summary}>{summary}</p>}
      {requiredAction && (
        <div className={css.requiredAction} data-required-action>
          {requiredAction}
        </div>
      )}
    </>
  );
}

/**
 * Collapsed attention card: the `type` (attentionTone) sets the accent stripe,
 * `priority` gets its own tone, and the whole card is clickable to expand.
 */
export function AttentionCard({
  type,
  priority,
  title,
  summary,
  requiredAction,
  ticketKey,
  onClick,
  className,
}: AttentionCardProps) {
  const aTone = attentionTone[type];
  const interactive = typeof onClick === "function";
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={[css.root, interactive ? css.clickable : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{ borderLeftColor: aTone.fg } as CSSProperties}
      data-attention-type={type}
      data-priority={priority}
      onClick={onClick}
    >
      <AttentionHeader
        type={type}
        priority={priority}
        title={title}
        summary={summary}
        requiredAction={requiredAction}
        ticketKey={ticketKey}
      />
    </Tag>
  );
}
