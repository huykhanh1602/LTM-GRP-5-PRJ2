CREATE TABLE IF NOT EXISTS ratings (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating DOUBLE PRECISION NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS rating_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating_before DOUBLE PRECISION NOT NULL,
  rating_after DOUBLE PRECISION NOT NULL,
  delta DOUBLE PRECISION NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS rating_applied_matches (
  match_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_leaderboard
  ON ratings (game_id, rating DESC, user_id);

CREATE INDEX IF NOT EXISTS idx_rating_history_user
  ON rating_history (game_id, user_id, created_at DESC);
