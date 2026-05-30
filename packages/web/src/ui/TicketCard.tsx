import type { CSSProperties } from "react";
import { ownerTone, statusTone } from "../design/tokens";
import type { TicketCardProps } from "./types";
import * as css from "./TicketCard.css";

/**
 * Product-level ticket card. Built bespoke (not via the generic Card) because
 * it owns several product-specific affordances the generic Card doesn't model:
 * the phase-chip eyebrow with the agent pulse + progress bar, the mono ticket
 * key, and the priority/assignees foot meta. It still respects the same
 * contract vars + semantic tones as Card, and shifts the owner stripe amber
 * when blocked (matching Card's block semantics).
 *
 * Visual meaning:
 *  - left owner stripe → ownerTone[owner] (amber when blocked)
 *  - status tone (statusTone[status]) drives the phase chip / accents
 *  - blockStatus==='blocked' renders the amber block banner with blockReason
 *  - phase.owner==='agent' with a percent → pulsing dot (1.6s, the only
 *    continuous animation) + progress bar
 */
export function TicketCard({
  ticketKey,
  title,
  status,
  owner,
  blockStatus = "none",
  blockReason,
  phase,
  priority,
  pills,
  assignees,
  onClick,
  className,
  children,
}: TicketCardProps) {
  const blocked = blockStatus === "blocked";
  const tone = statusTone[status];
  // Blocked tickets surface the amber owner tone regardless of the next mover.
  const stripeTone = blocked ? ownerTone.blocked : ownerTone[owner];

  const interactive = typeof onClick === "function";
  const Tag = interactive ? "button" : "div";

  const phaseTone = phase ? ownerTone[phase.owner] : tone;
  const agentWorking = phase?.owner === "agent";
  const hasProgress = agentWorking && typeof phase?.percent === "number";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={[css.root, interactive ? css.clickable : "", className]
        .filter(Boolean)
        .join(" ")}
      data-status={status}
      data-status-tone={tone.fg}
      data-owner={owner}
      data-block-status={blockStatus}
      onClick={onClick}
    >
      <span
        className={css.ownerStripe}
        style={{ background: stripeTone.fg } as CSSProperties}
        data-owner-stripe={blocked ? "blocked" : owner}
        aria-hidden
      />

      {blocked && (
        <div className={css.blockStripe} data-block-stripe role="status">
          <span aria-hidden>⚠</span>
          <span>{blockReason ?? "Blocked"}</span>
        </div>
      )}

      {phase && (
        <span
          className={css.phaseChip}
          style={{ color: phaseTone.fg } as CSSProperties}
          data-phase-owner={phase.owner}
        >
          {agentWorking && (
            <span
              className={css.agentDot}
              style={{ background: phaseTone.fg } as CSSProperties}
              data-agent-pulse
              aria-hidden
            />
          )}
          <span>{phase.label}</span>
          {hasProgress && <span>{phase.percent}%</span>}
        </span>
      )}

      {hasProgress && (
        <div
          className={css.progressTrack}
          role="progressbar"
          aria-valuenow={phase!.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={css.progressFill}
            style={
              {
                width: `${Math.max(0, Math.min(100, phase!.percent!))}%`,
                background: phaseTone.fg,
              } as CSSProperties
            }
          />
        </div>
      )}

      <span className={css.ticketKey}>{ticketKey}</span>
      <h3 className={css.title}>{title}</h3>

      {pills && <div className={css.pillRow}>{pills}</div>}
      {children}

      {(priority || assignees) && (
        <div className={css.foot}>
          <span className={css.priority}>
            <span
              aria-hidden
              style={{ color: tone.fg } as CSSProperties}
            >
              ●
            </span>
            {priority}
          </span>
          {assignees && <span className={css.assignees}>{assignees}</span>}
        </div>
      )}
    </Tag>
  );
}
