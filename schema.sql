-- PunditBot D1 schema
-- Apply: wrangler d1 execute punditbot --remote --file ./schema.sql

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

-- Subscriptions: which chat follows which match.
CREATE TABLE IF NOT EXISTS subs (
  match_id  TEXT NOT NULL,
  chat_id   TEXT NOT NULL,
  home_team TEXT, away_team TEXT,
  PRIMARY KEY (match_id, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_chat ON subs (chat_id);
CREATE INDEX IF NOT EXISTS idx_subs_match ON subs (match_id);

-- Cached commentary per match (for /recap).
CREATE TABLE IF NOT EXISTS match_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  type     TEXT,
  text     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ev_match ON match_events (match_id, ts);
