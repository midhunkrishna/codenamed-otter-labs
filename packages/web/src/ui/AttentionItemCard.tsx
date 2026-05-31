/**
 * AttentionItemCard (MIN-38) — the feature card the Attention page renders for a
 * single `AttentionItemVM`. Frozen prop contract (plan 007 §1.5):
 *
 *   { item; expanded; onToggleExpand(); onResolved() }
 *
 * Collapsed by default. When `expanded`, renders the sticky ExpandedAttentionCard
 * with a per-`attentionType` body assembled from the design primitives (PlanCard,
 * ApprovalCard, VerificationPacketTabs, FormCommentCard, CodeBlock, MetadataRow).
 *
 * Live-action wiring policy:
 *  - `plan_approval` is the ONE fully-wired live path: Approve / Send back call the
 *    existing plan endpoints (`POST /api/plans/:id/approve` · `/send-back`), then
 *    `onResolved()` so the page refetches.
 *  - The other 5 source APIs are DEFERRED (D-007-1): we render full context + an
 *    ALWAYS-present "link to full ticket/run" and the source-specific primary
 *    actions are stubbed/disabled with a note. The generic resolve/dismiss
 *    affordances are always wired (api/attention.ts).
 *  - Unknown attentionType → generic fallback card (never throws).
 *
 * The card NEVER auto-collapses on an `item` refetch — only `onToggleExpand`
 * collapses it (queue-stability invariant; the parent owns the expanded bit).
 *
 * The collapsed/expanded wrapper keeps the `data-testid="attention-card-<id>"` +
 * `data-expanded` contract the Attention page (Impl-C) drives its tests against.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  attentionFilterGroup,
  type AttentionType as TokenAttentionType,
} from "../design/tokens";
import {
  resolveAttention,
  dismissAttention,
  type AttentionItemVM,
  type AttentionType,
} from "../api/attention";
import { approvePlan, sendBackPlan } from "../api/plans";
import { ExpandedAttentionCard } from "./ExpandedAttentionCard";
import { AttentionCard } from "./AttentionCard";
import { PlanCard } from "./PlanCard";
import { ApprovalCard } from "./ApprovalCard";
import { VerificationPacketTabs } from "./VerificationPacketTabs";
import { FormCommentCard } from "./FormCommentCard";
import { MetadataRow } from "./MetadataRow";
import { CodeBlock } from "./CodeBlock";
import { Button } from "./Button";
import type { Priority, Risk, VerificationTab } from "./types";
import * as css from "./AttentionItemCard.css";

export interface AttentionItemCardProps {
  item: AttentionItemVM;
  expanded: boolean;
  onToggleExpand(): void;
  onResolved(): void;
}

/** The 6 canonical types the card has a dedicated expanded body for. */
const KNOWN_TYPES = new Set<AttentionType>([
  "permission_request",
  "plan_approval",
  "clarification_required",
  "verification_review",
  "execution_failed",
  "run_stalled",
]);

const VALID_PRIORITIES = new Set<Priority>(["low", "normal", "high", "urgent"]);
function asPriority(p: string): Priority {
  return VALID_PRIORITIES.has(p as Priority) ? (p as Priority) : "normal";
}

const VALID_RISKS = new Set<Risk>(["low", "medium", "high", "critical"]);
function asRisk(p: unknown): Risk {
  return typeof p === "string" && VALID_RISKS.has(p as Risk)
    ? (p as Risk)
    : "medium";
}

/** Read a non-empty string field from the item's free-form metadata bag. */
function metaStr(item: AttentionItemVM, key: string): string | undefined {
  const v = item.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** A ticket-key-ish label for the collapsed header (ticket > run > source). */
function sourceKey(item: AttentionItemVM): string | undefined {
  return item.ticketId ?? item.runId ?? item.sourceId ?? undefined;
}

/**
 * The ALWAYS-present "link to full ticket/run". Renders an anchor at the
 * conventional hash route. Forward-compatible (no router needed) and testable
 * via `data-run-link` / `data-ticket-link`.
 */
function SourceLink({ item }: { item: AttentionItemVM }) {
  if (item.runId) {
    return (
      <a className={css.link} href={`#/runs/${item.runId}`} data-run-link>
        Open run {item.runId} →
      </a>
    );
  }
  if (item.ticketId) {
    return (
      <a
        className={css.link}
        href={`#/tickets/${item.ticketId}`}
        data-ticket-link
      >
        Open ticket {item.ticketId} →
      </a>
    );
  }
  return (
    <a className={css.link} href={`#/source/${item.sourceId}`} data-source-link>
      Open source {item.sourceId} →
    </a>
  );
}

/** Small "deferred" note shown next to a stubbed primary action group. */
function DeferredNote({ theme }: { theme: string }) {
  return (
    <p className={css.note} data-deferred-note>
      Action available when {theme} ships.
    </p>
  );
}

/** A row of disabled source-specific primary actions + their deferred note. */
function StubActions({ labels, theme }: { labels: string[]; theme: string }) {
  return (
    <div data-stub-actions>
      <div className={css.actions}>
        {labels.map((l) => (
          <Button key={l} variant="default" disabled>
            {l}
          </Button>
        ))}
      </div>
      <DeferredNote theme={theme} />
    </div>
  );
}

export function AttentionItemCard({
  item,
  expanded,
  onToggleExpand,
  onResolved,
}: AttentionItemCardProps) {
  // Local UI state that must NOT reset when `item` updates from a refetch.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [vtab, setVtab] = useState<VerificationTab>("walkthrough");

  const type = item.attentionType as AttentionType;
  const known = KNOWN_TYPES.has(type);
  // attentionTone/ATTENTION_LABELS are keyed by the canonical token enum. For an
  // unknown type we fall back to a neutral header type (never throw). The real
  // unknown signal for tests is the generic body + the raw type text.
  const headerType: TokenAttentionType = known
    ? (type as unknown as TokenAttentionType)
    : ("plan_approval" as TokenAttentionType);
  const priority = asPriority(item.priority);
  const ticketKey = sourceKey(item);

  /** Run an async source mutation, surface errors, then resolve the queue item. */
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Collapsed ────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div
        data-testid={`attention-card-${item.id}`}
        data-expanded="false"
        data-attention-type={type}
      >
        <AttentionCard
          type={headerType}
          priority={priority}
          title={item.title}
          summary={item.summary}
          requiredAction={item.requiredAction}
          ticketKey={ticketKey}
          onClick={onToggleExpand}
        />
      </div>
    );
  }

  // ── Expanded: shared chrome + per-type body ──────────────────
  return (
    <div
      data-testid={`attention-card-${item.id}`}
      data-expanded="true"
      data-attention-type={type}
    >
      <ExpandedAttentionCard
        type={headerType}
        priority={priority}
        title={
          <button
            type="button"
            className={css.titleButton}
            aria-label={item.title}
            onClick={onToggleExpand}
          >
            {item.title}
          </button>
        }
        summary={item.summary}
        requiredAction={item.requiredAction}
        ticketKey={ticketKey}
        sticky
      >
        <div data-testid={`attention-card-body-${item.id}`}>
          {renderBody()}
          <SourceLink item={item} />
          {error && (
            <p className={css.error} role="alert" data-action-error>
              {error}
            </p>
          )}
          <div className={css.footer} data-attention-footer>
            <Button variant="ghost" onClick={onToggleExpand} aria-label="Collapse">
              Collapse
            </Button>
            <Button
              variant="default"
              disabled={busy}
              onClick={() => void act(() => dismissAttention(item.id))}
            >
              Dismiss
            </Button>
            <Button
              variant="default"
              disabled={busy}
              onClick={() => void act(() => resolveAttention(item.id))}
            >
              Mark resolved
            </Button>
          </div>
        </div>
      </ExpandedAttentionCard>
    </div>
  );

  function renderBody(): ReactNode {
    if (!known) return renderFallback();
    switch (type) {
      case "plan_approval":
        return renderPlanApproval();
      case "permission_request":
        return renderPermission();
      case "verification_review":
        return renderVerification();
      case "clarification_required":
        return renderClarification();
      case "execution_failed":
        return renderExecutionFailed();
      case "run_stalled":
        return renderRunStalled();
      default:
        return renderFallback();
    }
  }

  /** Unknown attentionType → safe generic body (title/summary/requiredAction). */
  function renderFallback(): ReactNode {
    return (
      <div data-generic-fallback>
        <MetadataRow
          columns={1}
          items={[
            { label: "Type", value: type },
            { label: "Required action", value: item.requiredAction },
          ]}
        />
      </div>
    );
  }

  // — plan_approval: the ONE fully-wired live path ───────────────
  function renderPlanApproval(): ReactNode {
    const planId = item.sourceId;
    return (
      <PlanCard
        version={metaStr(item, "planVersion") ?? "v1"}
        state="proposed"
        title={metaStr(item, "planTitle") ?? item.title}
        meta={item.summary}
        onApprove={() => void act(() => approvePlan(planId))}
        onReject={() => setShowFeedback((v) => !v)}
      >
        {metaStr(item, "planContent") && (
          <CodeBlock code={metaStr(item, "planContent")!} />
        )}
        {showFeedback && (
          <div className={css.feedback} data-send-back-form>
            <textarea
              className={css.textarea}
              placeholder="Feedback for the agent…"
              value={feedback}
              aria-label="Send-back feedback"
              onChange={(e) => setFeedback(e.target.value)}
            />
            <Button
              variant="primary"
              disabled={busy || feedback.trim().length === 0}
              onClick={() =>
                void act(() => sendBackPlan(planId, feedback.trim()))
              }
            >
              Send back with feedback
            </Button>
          </div>
        )}
      </PlanCard>
    );
  }

  // — permission_request (source API deferred, D-007-1) ──────────
  function renderPermission(): ReactNode {
    return (
      <div data-permission-body>
        <ApprovalCard
          actor={metaStr(item, "actor") ?? "Agent"}
          intent={metaStr(item, "intent") ?? item.summary ?? "wants permission"}
          command={metaStr(item, "command") ?? item.requiredAction}
          risk={asRisk(item.metadata?.risk)}
          facts={[
            { label: "Reason", value: metaStr(item, "reason") ?? "—" },
            { label: "Scope", value: metaStr(item, "scope") ?? "—" },
            { label: "Expires", value: item.expiresAt ?? "—" },
          ]}
        />
        <StubActions
          labels={["Approve", "Deny", "Ask to revise"]}
          theme="the Permissions producer"
        />
      </div>
    );
  }

  // — verification_review (source API deferred, D-007-1) ─────────
  function renderVerification(): ReactNode {
    return (
      <div data-verification-body>
        <VerificationPacketTabs
          activeTab={vtab}
          onSelect={setVtab}
          walkthrough={metaStr(item, "walkthrough") ?? item.summary ?? "—"}
          verify={metaStr(item, "verify") ?? item.requiredAction}
          facts={metaStr(item, "facts") ?? "—"}
          why={metaStr(item, "why") ?? "—"}
        />
        <StubActions
          labels={["Accept", "Request changes", "Send back", "Mark failed"]}
          theme="Verification"
        />
      </div>
    );
  }

  // — clarification_required (source API deferred, D-007-1) ──────
  function renderClarification(): ReactNode {
    return (
      <FormCommentCard
        author={metaStr(item, "author") ?? "Agent"}
        state="open"
        blocking
        footer={<StubActions labels={["Submit", "Dismiss"]} theme="Forms" />}
      >
        <p>{metaStr(item, "question") ?? item.summary ?? item.requiredAction}</p>
      </FormCommentCard>
    );
  }

  // — execution_failed (source API deferred, D-007-1) ───────────
  function renderExecutionFailed(): ReactNode {
    return (
      <div data-execution-failed-body>
        <p className={css.summaryLine}>
          {metaStr(item, "failureSummary") ??
            item.summary ??
            item.requiredAction}
        </p>
        {metaStr(item, "command") && (
          <CodeBlock code={metaStr(item, "command")!} />
        )}
        {metaStr(item, "lastOutput") && (
          <CodeBlock code={metaStr(item, "lastOutput")!} />
        )}
        <StubActions
          labels={["Retry", "Send back", "Mark failed"]}
          theme="the run runtime"
        />
      </div>
    );
  }

  // — run_stalled (source API deferred, D-007-1) ────────────────
  function renderRunStalled(): ReactNode {
    return (
      <div data-run-stalled-body>
        <MetadataRow
          columns={1}
          items={[
            {
              label: "Run status",
              value: metaStr(item, "runStatus") ?? "stalled",
            },
            {
              label: "Last activity",
              value: metaStr(item, "lastActivity") ?? "—",
            },
            { label: "Elapsed", value: metaStr(item, "elapsed") ?? "—" },
          ]}
        />
        <StubActions
          labels={["Open", "Cancel", "Leave running"]}
          theme="the run runtime"
        />
      </div>
    );
  }
}

/** Re-exported for the page filter row (single source of truth in tokens). */
export { attentionFilterGroup };
