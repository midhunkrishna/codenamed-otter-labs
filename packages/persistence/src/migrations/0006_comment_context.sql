-- MIN-27 clarification forms (comment-context).
-- ADDITIVE ONLY: new tables + indexes. Never edits migrations 0001-0005.
-- A form surfaces a structured clarification request in the comment stream; its
-- comment_id links back to the `form` kind comment, run_id (nullable) links the
-- parked agent run. Questions + answers are child rows hydrated on read.

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  blocks_ticket INTEGER NOT NULL DEFAULT 1,
  created_by_agent_id TEXT,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  dismissed_at TEXT
);

CREATE TABLE IF NOT EXISTS form_questions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL,
  label TEXT NOT NULL,
  help_text TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  options_json TEXT NOT NULL DEFAULT '[]',
  default_value_json TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS form_answers (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  answered_by_user_id TEXT,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forms_ticket ON forms(ticket_id);
CREATE INDEX IF NOT EXISTS idx_form_questions_form ON form_questions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_answers_form ON form_answers(form_id);
