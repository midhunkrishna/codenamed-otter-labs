-- MIN-14 / MIN-15 ticket-core schema additions.
-- ADDITIVE ONLY: extends 0001 without dropping or rewriting existing data.
-- 0001 stays applied; the migration runner never reruns it.

-- Ticket gains a block_status guard column (MVP: none | blocked).
ALTER TABLE ticket ADD COLUMN block_status TEXT NOT NULL DEFAULT 'none';

-- Comments gain a JSON-object metadata column (stored as a JSON string).
ALTER TABLE comment ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';

-- One row per lifecycle transition (MIN-15: exactly one event per transition).
CREATE TABLE IF NOT EXISTS ticket_event (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_event_ticket ON ticket_event(ticket_id);
