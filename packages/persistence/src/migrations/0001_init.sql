-- MIN-12 initial schema: source-of-truth domains.
-- SQLite is authoritative for ticket/comment/plan/run/permission/audit state.
-- Files under artifacts are derived companions, not primary truth.
-- Deterministic + idempotent: only runs once (recorded in the `migrations` table).

CREATE TABLE IF NOT EXISTS ticket (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS comment (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_comment_ticket ON comment(ticket_id);

CREATE TABLE IF NOT EXISTS plan (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'draft',
  content    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_ticket ON plan(ticket_id);

CREATE TABLE IF NOT EXISTS run (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  plan_id     TEXT REFERENCES plan(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  session_id  TEXT,
  started_at  TEXT,
  finished_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_run_ticket ON run(ticket_id);

CREATE TABLE IF NOT EXISTS permission (
  id         TEXT PRIMARY KEY,
  run_id     TEXT REFERENCES run(id) ON DELETE CASCADE,
  tool       TEXT NOT NULL,
  action     TEXT NOT NULL,
  decision   TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_permission_run ON permission(run_id);

CREATE TABLE IF NOT EXISTS audit (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  event       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit(entity_type, entity_id);
