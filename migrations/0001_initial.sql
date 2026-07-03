CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  pin_code TEXT NOT NULL DEFAULT '2468',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE event_branding (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  logo_url TEXT,
  accent_color TEXT NOT NULL DEFAULT '#E2712A',
  welcome_text TEXT NOT NULL DEFAULT 'Bem-vindo ao estande da FLAM! Teste seus conhecimentos biblicos e concorra a um brinde.',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE registration_fields (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  required INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, field_key)
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('basic', 'intermediate', 'expert')),
  custom_answers_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE queue_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  level TEXT NOT NULL CHECK(level IN ('basic', 'intermediate', 'expert')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'in_duel', 'done')),
  arrived_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_queue_event_status_level_arrived
ON queue_entries(event_id, status, level, arrived_at);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  level TEXT NOT NULL CHECK(level IN ('basic', 'intermediate', 'expert')),
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  options_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_questions_event_level_enabled
ON questions(event_id, level, enabled);

CREATE TABLE question_usage (
  question_id TEXT PRIMARY KEY REFERENCES questions(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  level TEXT NOT NULL CHECK(level IN ('basic', 'intermediate', 'expert')),
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);

CREATE TABLE duels (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  participant_a_id TEXT NOT NULL REFERENCES participants(id),
  participant_b_id TEXT NOT NULL REFERENCES participants(id),
  queue_entry_a_id TEXT NOT NULL REFERENCES queue_entries(id),
  queue_entry_b_id TEXT NOT NULL REFERENCES queue_entries(id),
  participant_a_level TEXT NOT NULL,
  participant_b_level TEXT NOT NULL,
  effective_level TEXT NOT NULL,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  current_round INTEGER NOT NULL DEFAULT 1,
  current_question_id TEXT REFERENCES questions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ready_to_finish', 'completed')),
  winner_participant_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_duels_event_status_created
ON duels(event_id, status, created_at);

CREATE TABLE duel_rounds (
  id TEXT PRIMARY KEY,
  duel_id TEXT NOT NULL REFERENCES duels(id),
  question_id TEXT REFERENCES questions(id),
  round_number INTEGER NOT NULL,
  winner_participant_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_duel_rounds_duel_round
ON duel_rounds(duel_id, round_number);
