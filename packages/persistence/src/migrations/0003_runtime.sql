-- MIN-45 / MIN-19 runtime-foundations schema additions.
-- ADDITIVE ONLY: extends 0001/0002 without dropping or rewriting existing data.
-- The legacy `run` table from 0001 is left intact and unused (no destructive change).

-- Default local project entity (MIN-45). Schema permits multiple projects later;
-- the MVP seeds exactly one stable default row (id matches DEFAULT_PROJECT_ID).
CREATE TABLE IF NOT EXISTS project (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  root       TEXT NOT NULL DEFAULT '',
  data_dir   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed the default project (idempotent: never overwrites an existing row).
INSERT OR IGNORE INTO project (id, name) VALUES ('local-project', 'Local Project');

-- Ticket gains an owning project (MIN-45). Additive column: existing rows + new
-- rows backfill via the default ⇒ "ticket creation uses default project id" needs
-- no ticket-repo change.
ALTER TABLE ticket ADD COLUMN project_id TEXT NOT NULL DEFAULT 'local-project';

-- Agent runs (MIN-19). Every run belongs to a project; ticket link is optional.
CREATE TABLE IF NOT EXISTS agent_runs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL DEFAULT 'local-project' REFERENCES project(id),
  ticket_id   TEXT REFERENCES ticket(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at  TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_status ON agent_runs(project_id, status);

-- Append-only per-run event log (MIN-19 / MIN-44 seam). seq is a per-run monotonic
-- counter; payload is a JSON object stored as text.
CREATE TABLE IF NOT EXISTS agent_run_events (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(run_id);
