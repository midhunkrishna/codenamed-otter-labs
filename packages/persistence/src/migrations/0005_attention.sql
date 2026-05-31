-- MIN-36 canonical attention queue.
-- ADDITIVE ONLY: supersedes the minimal plan-006 `attention_item` (singular) table
-- without dropping it. The legacy table is left dormant (no data loss); its open/
-- resolved rows are backfilled into `attention_items` below.

CREATE TABLE IF NOT EXISTS attention_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  attention_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  ticket_id TEXT REFERENCES ticket(id) ON DELETE CASCADE,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  required_action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  dismissed_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attn_items_project ON attention_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_attn_items_ticket  ON attention_items(ticket_id);
-- At most ONE open item per (source_type, source_id, attention_type).
-- (Focus is client-side UI state and is never persisted, so `open` is the sole active state.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_attn_items_one_open
  ON attention_items(source_type, source_id, attention_type)
  WHERE status = 'open';

-- Backfill legacy plan-006 rows (kind was always 'plan_approval', source = plan).
INSERT OR IGNORE INTO attention_items
  (id, project_id, attention_type, source_type, source_id, ticket_id, status,
   priority, title, summary, required_action, metadata_json, created_at, updated_at, resolved_at)
SELECT id, 'local-project', 'plan_approval', 'plan', COALESCE(ref_id, id), ticket_id,
       status, 'high', 'Plan awaiting approval', COALESCE(detail, ''),
       'Approve plan or send back with feedback.', '{}', created_at, updated_at, resolved_at
FROM attention_item;
