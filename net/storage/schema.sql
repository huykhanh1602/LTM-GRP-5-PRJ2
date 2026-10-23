PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('captain','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  game_id TEXT NOT NULL DEFAULT 'rps_chess' REFERENCES games(id),
  mode TEXT NOT NULL DEFAULT 'ranked' CHECK(mode IN ('casual', 'ranked', 'tournament')),
  round_id TEXT REFERENCES tournament_rounds(id),
  team_a_id TEXT NOT NULL REFERENCES teams(id),
  team_b_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL CHECK(status IN ('playing', 'finished', 'aborted')),
  ranked INTEGER NOT NULL CHECK(ranked IN (0, 1)),
  winner_id TEXT REFERENCES teams(id),
  reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  scheduled_at TEXT,
  auto_start INTEGER NOT NULL DEFAULT 1 CHECK(auto_start IN (0, 1)),
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
-- API domains from the platform design. Users/auth identities are kept separate
-- so an OAuth provider ID is never treated as the user's public ID.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_salt TEXT,
  password_hash TEXT,
  student_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player', 'organizer', 'admin')),
  banned INTEGER NOT NULL DEFAULT 0 CHECK(banned IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_identities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  PRIMARY KEY(provider, provider_user_id)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_config_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
INSERT OR IGNORE INTO games (id, name, default_config_json, active)
VALUES ('rps_chess', 'Kéo · Búa · Bao Cờ', '{}', 1);
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('single_elimination', 'round_robin', 'swiss')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  config_json TEXT NOT NULL DEFAULT '{}',
  starts_at TEXT,
  champion_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK(round_no > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
  scheduled_at TEXT,
  auto_start INTEGER NOT NULL DEFAULT 1 CHECK(auto_start IN (0, 1)),
  UNIQUE(tournament_id, round_no)
);
CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  seed INTEGER CHECK(seed IS NULL OR seed > 0),
  points REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(tournament_id, user_id),
  UNIQUE(tournament_id, team_id),
  CHECK(user_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS tournament_match_history (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  match_id TEXT UNIQUE REFERENCES matches(id) ON DELETE SET NULL,
  slot_index INTEGER NOT NULL DEFAULT 0,
  participant_a_id TEXT NOT NULL,
  participant_a_name TEXT NOT NULL,
  participant_b_id TEXT NOT NULL,
  participant_b_name TEXT NOT NULL,
  winner_id TEXT,
  result_json TEXT,
  played_at TEXT NOT NULL,
  CHECK(participant_a_id <> participant_b_id),
  CHECK(winner_id IS NULL OR winner_id IN (participant_a_id,participant_b_id))
);
CREATE INDEX IF NOT EXISTS idx_tournament_match_history_round ON tournament_match_history(tournament_id,round_id,played_at);
CREATE TABLE IF NOT EXISTS bot_submissions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  filename TEXT NOT NULL,
  source TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bot_submissions_room_team ON bot_submissions(room_id, team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_matches_team_a ON matches(team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b ON matches(team_b_id);
-- Migration cho các cột mới trên bảng đã tồn tại (SQLite dùng ALTER TABLE an toàn)
CREATE INDEX IF NOT EXISTS idx_tournament_entries_team ON tournament_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON matches(scheduled_at) WHERE scheduled_at IS NOT NULL;
