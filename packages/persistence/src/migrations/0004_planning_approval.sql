-- MIN-22 / MIN-23 planning-approval schema additions.
-- ADDITIVE ONLY: extends earlier migrations without dropping or rewriting data.
-- Earlier migrations stay applied; the runner never reruns them.

-- Plan versioning + provenance (MIN-22). Additive columns on the existing plan table.
ALTER TABLE plan ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE plan ADD COLUMN run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL;
ALTER TABLE plan ADD COLUMN artifact_path TEXT;          -- relative path under data dir
-- plan.status values used going forward: 'proposed' | 'approved' | 'sent_back' | 'superseded'
-- At most ONE approved plan per ticket:
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_one_approved
  ON plan(ticket_id) WHERE status = 'approved';

-- Ticket points at its approved plan (MIN-23 invariant: executable requires approved plan id).
ALTER TABLE ticket ADD COLUMN approved_plan_id TEXT REFERENCES plan(id) ON DELETE SET NULL;

-- Attention queue (MIN-23). MVP kind = 'plan_approval'; schema generalizes.
CREATE TABLE IF NOT EXISTS attention_item (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT REFERENCES ticket(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'resolved'
  ref_id      TEXT,                             -- e.g. the plan id awaiting decision
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attention_ticket ON attention_item(ticket_id);
-- At most ONE open attention item per (ticket, kind):
CREATE UNIQUE INDEX IF NOT EXISTS idx_attention_one_open
  ON attention_item(ticket_id, kind) WHERE status = 'open';
