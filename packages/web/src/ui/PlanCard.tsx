import { useState } from "react";
import type { PlanCardProps, PlanState, ToneSelector } from "./types";
import { Pill } from "./Pill";
import { Button } from "./Button";
import * as css from "./PlanCard.css";

/**
 * Plan-state → semantic Pill tone. Reuses the lifecycle/risk tone vocabulary so
 * the plan state reads in the same color language as everything else (no raw
 * colors): proposed=blue, approved=green, rejected=red, superseded=neutral gray.
 */
const STATE_TONE: Record<PlanState, ToneSelector> = {
  proposed: "status.plannable",
  approved: "status.done",
  rejected: "status.failed",
  superseded: "neutral",
};

const STATE_LABEL: Record<PlanState, string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

/**
 * Plan proposal card. Mono version + state pill (colored by state) + title +
 * meta, with collapsible children (approach/files) and Approve/Reject actions.
 * Actions only render while the plan is still actionable (proposed).
 */
export function PlanCard({
  version,
  state,
  title,
  meta,
  children,
  onApprove,
  onReject,
  className,
}: PlanCardProps) {
  const [open, setOpen] = useState(true);
  const actionable = state === "proposed";
  return (
    <div
      className={[css.root, className].filter(Boolean).join(" ")}
      data-plan-state={state}
    >
      <div className={css.head}>
        <span className={css.version}>{version}</span>
        <Pill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Pill>
      </div>

      <h3 className={css.title}>{title}</h3>
      {meta && <div className={css.meta}>{meta}</div>}

      {children && (
        <>
          <button
            type="button"
            className={css.toggle}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden>{open ? "▾" : "▸"}</span>
            {open ? "Hide details" : "Show details"}
          </button>
          {open && (
            <div className={css.body} data-plan-body>
              {children}
            </div>
          )}
        </>
      )}

      {actionable && (onApprove || onReject) && (
        <div className={css.actions}>
          {onApprove && (
            <Button variant="primary" onClick={onApprove}>
              Approve
            </Button>
          )}
          {onReject && (
            <Button variant="danger" onClick={onReject}>
              Reject
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
