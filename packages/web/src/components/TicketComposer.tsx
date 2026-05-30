import { useEffect, useRef, useState } from "react";
import { createTicket } from "../api/client";
import { Button } from "../ui";
import * as css from "../app/App.css";

interface TicketComposerProps {
  /** Called after a successful create so the board can refetch. */
  onCreated(): void;
  /** Close the composer (Cancel / Esc / add-and-close). */
  onClose(): void;
}

/**
 * Quick-capture ticket composer. An on-demand, card-shaped mini-form that lives
 * at the top of the Created column. Title only — description is filled later in
 * the detail panel (the reference design treats creation as fast capture, not a
 * full form). Keyboard: Enter adds and keeps the composer open for rapid entry,
 * ⌘/Ctrl+Enter adds and closes, Esc cancels.
 */
export function TicketComposer({ onCreated, onClose }: TicketComposerProps) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(keepOpen: boolean) {
    const trimmed = title.trim();
    if (!trimmed) {
      if (!keepOpen) onClose();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTicket({ title: trimmed });
      onCreated();
      if (keepOpen) {
        setTitle("");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Plain Enter keeps the composer open for the next ticket; ⌘/Ctrl+Enter
      // adds and closes.
      void submit(!(e.metaKey || e.ctrlKey));
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className={css.composer}>
      <textarea
        ref={inputRef}
        className={css.composerInput}
        value={title}
        rows={2}
        placeholder="What needs doing?"
        aria-label="New ticket title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}
      <div className={css.composerFoot}>
        <span className={css.composerHint}>
          ↵ add · ⌘↵ add &amp; close · Esc cancel
        </span>
        <div className={css.composerActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit(false)}
            disabled={busy || !title.trim()}
          >
            Add ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
