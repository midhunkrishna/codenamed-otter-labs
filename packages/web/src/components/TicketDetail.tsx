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
import { statusLabel } from "./status";

interface TicketDetailProps {
  ticketId: string;
  /** Close the detail view and return to the board. */
  onClose(): void;
  /** Called after any mutation so the parent board can refetch. */
  onMutated(): void;
}

/** Ticket detail: title, editable description, comment stream (oldest first),
 * add-comment form, and transition buttons driven ONLY by the backend's
 * `next` array. Refetches ticket + transitions + comments after mutations. */
export function TicketDetail({
  ticketId,
  onClose,
  onMutated,
}: TicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [transitions, setTransitions] = useState<TransitionsResponse | null>(
    null,
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Description editor state.
  const [draftDescription, setDraftDescription] = useState("");

  // Add-comment state.
  const [commentBody, setCommentBody] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, tr, cs] = await Promise.all([
        getTicket(ticketId),
        getTransitions(ticketId),
        listComments(ticketId),
      ]);
      setTicket(t);
      setDraftDescription(t.description);
      setTransitions(tr);
      setComments(cs);
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

  if (!ticket) {
    return (
      <section className="ticket-detail" aria-label="Ticket detail">
        <button type="button" onClick={onClose}>
          Back to board
        </button>
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </section>
    );
  }

  return (
    <section className="ticket-detail" aria-label="Ticket detail">
      <button type="button" onClick={onClose}>
        Back to board
      </button>

      <h3>{ticket.title}</h3>
      <p className="ticket-detail__status">
        Status: {statusLabel(ticket.status)}
      </p>

      {error ? (
        <p role="alert" className="ticket-detail__error">
          {error}
        </p>
      ) : null}

      <form className="ticket-detail__description" onSubmit={handleSaveDescription}>
        <label>
          Description
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            aria-label="Edit description"
          />
        </label>
        <button type="submit">Save description</button>
      </form>

      <section aria-label="Transitions" className="ticket-detail__transitions">
        <h4>Actions</h4>
        {/* Buttons come ONLY from the backend `next` array — never hardcoded. */}
        {transitions && transitions.next.length > 0 ? (
          transitions.next.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => handleTransition(to)}
            >
              {statusLabel(to)}
            </button>
          ))
        ) : (
          <p>No actions available.</p>
        )}
      </section>

      <section aria-label="Comments" className="ticket-detail__comments">
        <h4>Comments</h4>
        <ul data-testid="comment-stream">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <span className="comment__author">{c.author}</span>
              <span className="comment__body">{c.body}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddComment}>
          <label>
            Add a comment
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              aria-label="New comment"
            />
          </label>
          <button type="submit" disabled={!commentBody.trim()}>
            Add comment
          </button>
        </form>
      </section>
    </section>
  );
}
