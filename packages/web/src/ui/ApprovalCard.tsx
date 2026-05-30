import { RISK_LABELS } from "../design/tokens";
import type { ApprovalCardProps } from "./types";
import { Pill } from "./Pill";
import { Button } from "./Button";
import { CodeBlock } from "./CodeBlock";
import { MetadataRow } from "./MetadataRow";
import * as css from "./ApprovalCard.css";

/**
 * Permission/approval card. Composes Impl-B primitives: the risk pill is a
 * <Pill tone="risk.*">, the verbatim command is a <CodeBlock> (never
 * paraphrased), the facts grid is a <MetadataRow>, and the three actions are
 * <Button>s (primary Approve / danger Deny / ghost Revise).
 */
export function ApprovalCard({
  actor,
  intent,
  command,
  risk,
  facts,
  onApprove,
  onDeny,
  onRevise,
  className,
}: ApprovalCardProps) {
  return (
    <div
      className={[css.root, className].filter(Boolean).join(" ")}
      data-risk={risk}
    >
      <div className={css.head}>
        <p className={css.lede}>
          <span className={css.actor}>{actor}</span>{" "}
          <span className={css.intent}>{intent}</span>
        </p>
        <Pill tone={`risk.${risk}`}>{RISK_LABELS[risk]}</Pill>
      </div>

      <CodeBlock code={command} />

      {facts.length > 0 && <MetadataRow items={facts} />}

      <div className={css.actions}>
        {onApprove && (
          <Button variant="primary" onClick={onApprove}>
            Approve
          </Button>
        )}
        {onDeny && (
          <Button variant="danger" onClick={onDeny}>
            Deny
          </Button>
        )}
        {onRevise && (
          <Button variant="ghost" onClick={onRevise}>
            Revise
          </Button>
        )}
      </div>
    </div>
  );
}
