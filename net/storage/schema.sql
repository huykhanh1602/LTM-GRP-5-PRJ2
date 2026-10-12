PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  team_a_id TEXT NOT NULL REFERENCES teams(id),
  team_b_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL CHECK(status IN ('playing', 'finished', 'aborted')),
  ranked INTEGER NOT NULL CHECK(ranked IN (0, 1)),
  winner_id TEXT REFERENCES teams(id),
  reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  config_json TEXT NOT NULL,
  initial_state_json TEXT NOT NULL,
  final_state_json TEXT NOT NULL,
  result_json TEXT,
  CHECK(team_a_id <> team_b_id),
  CHECK(winner_id IS NULL OR winner_id IN (team_a_id, team_b_id))
);
CREATE TABLE IF NOT EXISTS match_turns (
  match_id TEXT NOT NULL REFERENCES matches(id),
  turn INTEGER NOT NULL CHECK(turn >= 0),
  player TEXT,
  actions_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(match_id, turn)
);
CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_matches_team_a ON matches(team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b ON matches(team_b_id);
