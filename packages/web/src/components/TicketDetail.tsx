import { useCallback, useEffect, useState } from "react";
import {
  createComment,
  getTicket,
  getTransitions,
  listComments,
  postTransition,
  updateTicket,
  type Comment,
  type Ticket,
  type TransitionsResponse,
} from "../api/client";
import {
  approvePlan,
  getTicketPlans,
  sendBackPlan,
  type Plan,
} from "../api/plans";
import { ownerForTicket, statusLabel } from "./status";
import { Button, CodeBlock, PageHeader, PlanCard, Pill } from "../ui";
import type { PlanState } from "../ui";
import * as css from "../app/App.css";

/** Map the plan status (plan §2.2) onto the PlanCard's visual state. */
function planCardState(status: Plan["status"]): PlanState {
  switch (status) {
    case "approved":
      return "approved";
    case "sent_back":
      return "rejected";
    case "superseded":
      return "superseded";
    default:
      return "proposed";
  }
}

interface TicketDetailProps {
  ticketId: string;
  /** Called after any mutation so the parent board can refetch. */
  onMutated(): void;
}

/** Ticket detail: title, editable description, comment stream (oldest first),
 * add-comment form, and transition buttons driven ONLY by the backend's
 * `next` array. Refetches ticket + transitions + comments after mutations.
 * Rendered inside the board's Drawer, which owns closing (× / Esc / scrim). */
export function TicketDetail({ ticketId, onMutated }: TicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [transitions, setTransitions] = useState<TransitionsResponse | null>(
    null,
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Description editor state.
  const [draftDescription, setDraftDescription] = useState("");

  // Add-comment state.
  const [commentBody, setCommentBody] = useState("");

  // Send-back feedback (required for the send-back action).
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, tr, cs, ps] = await Promise.all([
        getTicket(ticketId),
        getTransitions(ticketId),
        listComments(ticketId),
        getTicketPlans(ticketId),
      ]);
      setTicket(t);
      setDraftDescription(t.description);
      setTransitions(tr);
      setComments(cs);
      setPlans(ps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveDescription(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateTicket(ticketId, { description: draftDescription });
      await load(); // refetch after mutation (invariant)
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setError(null);
    try {
      await createComment(ticketId, { body: commentBody.trim() });
      setCommentBody("");
      await load(); // refetch the comment stream after mutation (invariant)
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    }
  }

  async function handleTransition(to: Ticket["status"]) {
    setError(null);
    try {
      await postTransition(ticketId, { to });
      await load(); // refetch ticket + transitions after mutation (invariant)
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed");
    }
  }

  async function handleApprovePlan(planId: string) {
    setError(null);
    try {
      await approvePlan(planId);
      await load(); // refetch after mutation (invariant)
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function handleSendBackPlan(planId: string) {
    if (!feedback.trim()) return; // feedback is required for send-back
    setError(null);
    try {
      await sendBackPlan(planId, feedback.trim());
      setFeedback("");
      await load(); // refetch after mutation (invariant)
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send back failed");
    }
  }

  if (!ticket) {
    return (
      <section className={css.detail} aria-label="Ticket detail">
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </section>
    );
  }

  const owner = ownerForTicket(ticket.status, ticket.blockStatus);

  return (
    <section className={css.detail} aria-label="Ticket detail">
      <PageHeader
        eyebrow={ticket.id}
        title={ticket.title}
        description={
          <span className={css.actionRow}>
            <Pill tone={`status.${ticket.status}`}>
              {statusLabel(ticket.status)}
            </Pill>
            <Pill tone={`owner.${owner}`}>{owner}</Pill>
            {ticket.blockStatus === "blocked" ? (
              <Pill tone="risk.critical">Blocked</Pill>
            ) : null}
          </span>
        }
      />

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      <form className={css.detailSection} onSubmit={handleSaveDescription}>
        <label className={css.fieldLabel}>
          Description
          <textarea
            className={css.textarea}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            aria-label="Edit description"
          />
        </label>
        <div className={css.actionRow}>
          <Button type="submit" variant="primary">
            Save description
          </Button>
        </div>
      </form>

      <section aria-label="Transitions" className={css.detailSection}>
        <h4>Actions</h4>
        {/* Buttons come ONLY from the backend `next` array — never hardcoded. */}
        {transitions && transitions.next.length > 0 ? (
          <div className={css.actionRow}>
            {transitions.next.map((to) => (
              <Button key={to} onClick={() => handleTransition(to)}>
                {statusLabel(to)}
              </Button>
            ))}
          </div>
        ) : (
          <p>No actions available.</p>
        )}
      </section>

      <section aria-label="Plan" className={css.detailSection}>
        <h4>Plan</h4>
        {plans.length === 0 ? (
          <p>No plan yet.</p>
        ) : (
          (() => {
            // Plans come version DESC; the latest is the plan of record.
            const latest = plans[0]!;
            const canDecide =
              ticket.status === "needs_user_approval" &&
              latest.status === "proposed";
            return (
              <div data-testid="plan-card">
                <PlanCard
                  version={`v${latest.version}`}
                  state={planCardState(latest.status)}
                  title={latest.title || "Untitled plan"}
                  meta={
                    latest.artifactPath ? (
                      <span>{latest.artifactPath}</span>
                    ) : undefined
                  }
                >
                  <CodeBlock code={latest.content} />
                </PlanCard>

                {canDecide ? (
                  <div className={css.detailSection}>
                    <div className={css.actionRow}>
                      <Button
                        variant="primary"
                        onClick={() => handleApprovePlan(latest.id)}
                      >
                        Approve
                      </Button>
                    </div>
                    <label className={css.fieldLabel}>
                      Send-back feedback
                      <textarea
                        className={css.textarea}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        aria-label="Send-back feedback"
                      />
                    </label>
                    <div className={css.actionRow}>
                      <Button
                        variant="danger"
                        disabled={!feedback.trim()}
                        onClick={() => handleSendBackPlan(latest.id)}
                      >
                        Send back
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()
        )}
      </section>

      <section aria-label="Comments" className={css.detailSection}>
        <h4>Comments</h4>
        <ul data-testid="comment-stream" className={css.commentStream}>
          {comments.map((c) => (
            <li key={c.id} className={css.comment}>
              <span className={css.commentAuthor}>{c.author}</span>
              <span className={css.commentBody}>{c.body}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddComment}>
          <label className={css.fieldLabel}>
            Add a comment
            <textarea
              className={css.textarea}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              aria-label="New comment"
            />
          </label>
          <div className={css.actionRow}>
            <Button type="submit" variant="primary" disabled={!commentBody.trim()}>
              Add comment
            </Button>
          </div>
        </form>
      </section>
    </section>
  );
}
