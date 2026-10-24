CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- users phải tạo TRƯỚC team_members (FK tới users).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, avatar_url TEXT,
  email TEXT UNIQUE, phone TEXT UNIQUE, password_salt TEXT, password_hash TEXT,
  student_id TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'player'
    CHECK (role IN ('player','organizer','admin')),
  banned BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('captain','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE TABLE IF NOT EXISTS auth_identities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, email TEXT,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO games (id, name, default_config, active)
VALUES ('rps_chess', 'Kéo · Búa · Bao Cờ', '{}'::jsonb, TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO games (id, name, default_config, active)
VALUES ('snake_battle', 'Rắn Săn Mồi (Snake Bot)', '{}'::jsonb, TRUE)
ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS player_invitations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('team','match')),
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  room_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK(sender_id <> recipient_id),
  CHECK((type='team' AND team_id IS NOT NULL AND game_id IS NULL AND room_code IS NULL) OR
        (type='match' AND team_id IS NULL AND game_id IS NOT NULL AND room_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_player_invitations_recipient ON player_invitations(recipient_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_invitations_sender ON player_invitations(sender_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
  game_id TEXT NOT NULL DEFAULT 'rps_chess' REFERENCES games(id),
  mode TEXT NOT NULL DEFAULT 'ranked' CHECK(mode IN ('casual','ranked','tournament')),
  round_id TEXT,
  team_a_id TEXT NOT NULL REFERENCES teams(id), team_b_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL CHECK(status IN ('playing','finished','aborted')),
  ranked BOOLEAN NOT NULL, winner_id TEXT REFERENCES teams(id), reason TEXT,
  started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  auto_start BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb, initial_state JSONB NOT NULL DEFAULT 'null'::jsonb,
  final_state JSONB NOT NULL DEFAULT 'null'::jsonb, result JSONB,
  CHECK (team_a_id <> team_b_id), CHECK (winner_id IS NULL OR winner_id IN (team_a_id, team_b_id))
);
CREATE TABLE IF NOT EXISTS match_turns (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL CHECK(turn >= 0), player TEXT,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb, events JSONB NOT NULL DEFAULT '[]'::jsonb,
  state JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(match_id,turn)
);
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('single_elimination','round_robin','swiss')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','in_progress','completed','cancelled')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb, starts_at TIMESTAMPTZ, champion_id TEXT,
  bracket_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK(round_no > 0), status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','completed')),
  scheduled_at TIMESTAMPTZ,
  auto_start BOOLEAN NOT NULL DEFAULT TRUE,
  submission_started_at TIMESTAMPTZ,
  submission_deadline TIMESTAMPTZ,
  UNIQUE(tournament_id,round_no)
);
ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS submission_started_at TIMESTAMPTZ;
ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_matches_round') THEN
    ALTER TABLE matches ADD CONSTRAINT fk_matches_round FOREIGN KEY (round_id) REFERENCES tournament_rounds(id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS tournament_entries (
  id TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  seed INTEGER CHECK(seed IS NULL OR seed > 0),
  points DOUBLE PRECISION NOT NULL DEFAULT 0,
  bot_submission_id TEXT,
  CHECK(user_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS tournament_match_history (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  match_id TEXT UNIQUE REFERENCES matches(id) ON DELETE SET NULL,
  participant_a_id TEXT NOT NULL, participant_a_name TEXT NOT NULL,
  participant_b_id TEXT NOT NULL, participant_b_name TEXT NOT NULL,
  winner_id TEXT, result JSONB, played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(participant_a_id <> participant_b_id),
  CHECK(winner_id IS NULL OR winner_id IN (participant_a_id,participant_b_id))
);
CREATE INDEX IF NOT EXISTS idx_tournament_match_history_round ON tournament_match_history(tournament_id,round_id,played_at);
ALTER TABLE tournament_match_history ADD COLUMN IF NOT EXISTS slot_index INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS tournament_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('schedule','match','result','champion','status')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS idx_tournament_notifications_user ON tournament_notifications(user_id,read_at,created_at DESC);
CREATE TABLE IF NOT EXISTS tournament_notification_sync (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tournament_readiness (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK(round_no > 0),
  slot_index INTEGER NOT NULL CHECK(slot_index >= 0),
  participant_id TEXT NOT NULL,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(tournament_id,round_no,slot_index,participant_id)
);
CREATE TABLE IF NOT EXISTS tournament_round_submissions (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK(round_no > 0),
  entry_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(tournament_id,round_no,entry_id)
);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS champion_id TEXT;
-- Domain bracket snapshot (TournamentService/PostgresTournamentRepository).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_json JSONB;
CREATE TABLE IF NOT EXISTS bot_submissions (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, team_id TEXT NOT NULL REFERENCES teams(id),
  filename TEXT NOT NULL, source TEXT NOT NULL, source_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at DESC,id);
CREATE INDEX IF NOT EXISTS idx_matches_team_a ON matches(team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b ON matches(team_b_id);
CREATE INDEX IF NOT EXISTS idx_bot_submissions_room_team ON bot_submissions(room_id,team_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status,starts_at);
-- Migration cho các cột mới trên bảng đã tồn tại
ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT TRUE;

-- tournament_entries (chế độ TEAM): PK cũ (tournament_id,user_id) chặn user_id NULL
-- -> lỗi 42P16. Bỏ PK cũ, thêm khóa surrogate `id`, rồi mới drop NOT NULL.
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id);
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS id TEXT;
UPDATE tournament_entries SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL;
ALTER TABLE tournament_entries ALTER COLUMN id SET DEFAULT md5(random()::text || clock_timestamp()::text);
ALTER TABLE tournament_entries ALTER COLUMN id SET NOT NULL;
ALTER TABLE tournament_entries DROP CONSTRAINT IF EXISTS tournament_entries_pkey;
ALTER TABLE tournament_entries ALTER COLUMN user_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tournament_entries'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE tournament_entries ADD PRIMARY KEY (id);
  END IF;
END $$;
-- Ràng buộc duy nhất thay cho PK/UNIQUE cũ (NULL vẫn được phép nhờ unique index).
ALTER TABLE tournament_entries DROP CONSTRAINT IF EXISTS tournament_entries_tournament_id_team_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_entries_user ON tournament_entries(tournament_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_entries_team ON tournament_entries(tournament_id, team_id);

ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS bot_submission_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tournament_entries_team ON tournament_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON matches(scheduled_at) WHERE scheduled_at IS NOT NULL;
