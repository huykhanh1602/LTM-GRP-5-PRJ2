ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_json JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  participant_a_id TEXT,
  participant_b_id TEXT,
  winner_id TEXT,
  engine_match_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready', 'running', 'done', 'bye')),
  result_json JSONB,
  replay_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (tournament_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament
  ON tournament_matches (tournament_id, round_key, match_key);
