import { useState } from "react";
import { createTicket } from "../api/client";

interface CreateTicketFormProps {
  /** Called after a successful create so the parent can refetch the board. */
  onCreated(): void;
}

/** Create-ticket flow: title (required) + optional description. On submit it
 * POSTs `/api/tickets`, then asks the parent to refresh. */
export function CreateTicketForm({ onCreated }: CreateTicketFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTicket({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-ticket" onSubmit={handleSubmit}>
      <label>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New ticket title"
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="New ticket description"
        />
      </label>
      {error ? (
        <p role="alert" className="create-ticket__error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy || !title.trim()}>
        Create ticket
      </button>
    </form>
  );
}
