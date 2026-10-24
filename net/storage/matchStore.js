import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createFrames, appendTurn as appendReplayTurn } from '../../src/utils/replayEngine.js';
import { BYE_ID, BYE_NAME, buildBracket, nextSlotOf, pairFirstRound, planSize, slotCount } from './tournamentBracket.js';
import { normalizeSearchText, searchTermMatches } from './searchText.js';

export class StorageError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StorageError('INVALID_INPUT', `${field} must be a non-empty string`);
  }
  return value.trim();
}

function pageValue(value, fallback, max) {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max || String(value).trim() === '') {
    throw new StorageError('INVALID_PAGINATION', 'Invalid limit or offset');
  }
  return number;
}

function timestamp(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new StorageError('INVALID_INPUT', 'Invalid match timestamp');
  return date.toISOString();
}

// Cổng kiểm tra khung mở/đóng đơn đăng ký.
function assertRegistrationWindowOpen(config, now = Date.now()) {
  const open = config?.registrationOpensAt ? new Date(config.registrationOpensAt).getTime() : null;
  const close = config?.registrationClosesAt ? new Date(config.registrationClosesAt).getTime() : null;
  if (open !== null && now < open) {
    throw new StorageError('REGISTRATION_NOT_OPEN', 'Chưa tới thời gian mở đơn đăng ký', 409);
  }
  if (close !== null && now > close) {
    throw new StorageError('REGISTRATION_CLOSED', 'Đã đóng đơn đăng ký', 409);
  }
}

function assertRegistrationClosed(config, now = Date.now()) {
  const close = config?.registrationClosesAt ? new Date(config.registrationClosesAt).getTime() : null;
  if (close !== null && now < close) {
    throw new StorageError('REGISTRATION_STILL_OPEN', 'Chưa tới thời gian đóng đơn, chưa thể khởi tranh', 409);
  }
}

// node:sqlite báo lỗi ràng buộc qua errcode, không phải chuỗi code.
const CONSTRAINT_KINDS = { 787: 'FOREIGNKEY', 1555: 'PRIMARYKEY', 2067: 'UNIQUE' };
function constraintKind(error) {
  return CONSTRAINT_KINDS[error?.errcode] ?? null;
}

export function createMatchStore({ filename = process.env.DB_PATH || resolve('data/game.sqlite') } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.exec("INSERT OR IGNORE INTO games (id, name, default_config_json, active) VALUES ('rps_chess', 'Kéo · Búa · Bao Cờ', '{}', 1);");
  db.exec("INSERT OR IGNORE INTO games (id, name, default_config_json, active) VALUES ('snake_battle', 'Rắn Săn Mồi (Snake Bot)', '{}', 1);");
  const matchColumns = new Set(db.prepare('PRAGMA table_info(matches)').all().map(column => column.name));
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  for (const [name, type] of [['email','TEXT'],['phone','TEXT'],['password_salt','TEXT'],['password_hash','TEXT']]) {
    if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  if (!userColumns.has('guest')) {
    db.exec('ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0 CHECK(guest IN (0, 1))');
    // Older databases did not persist this flag. Recover guest rows from the
    // absence of account credentials and linked identity providers.
    db.exec(`UPDATE users SET guest = 1
      WHERE email IS NULL AND phone IS NULL AND password_hash IS NULL AND password_salt IS NULL
        AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE auth_identities.user_id = users.id)`);
  }
  const tournamentColumns = new Set(db.prepare('PRAGMA table_info(tournaments)').all().map(column => column.name));
  if (!tournamentColumns.has('champion_id')) db.exec('ALTER TABLE tournaments ADD COLUMN champion_id TEXT');
  if (!matchColumns.has('game_id')) {
    db.exec("ALTER TABLE matches ADD COLUMN game_id TEXT REFERENCES games(id);");
    db.exec("UPDATE matches SET game_id = 'rps_chess' WHERE game_id IS NULL;");
  }
  if (!matchColumns.has('mode')) db.exec("ALTER TABLE matches ADD COLUMN mode TEXT NOT NULL DEFAULT 'ranked' CHECK(mode IN ('casual','ranked','tournament'));");
  if (!matchColumns.has('round_id')) db.exec('ALTER TABLE matches ADD COLUMN round_id TEXT REFERENCES tournament_rounds(id);');
  if (!matchColumns.has('scheduled_at')) db.exec('ALTER TABLE matches ADD COLUMN scheduled_at TEXT');
  if (!matchColumns.has('auto_start')) db.exec("ALTER TABLE matches ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 1 CHECK(auto_start IN (0, 1));");
  const roundColumns = new Set(db.prepare('PRAGMA table_info(tournament_rounds)').all().map(column => column.name));
  if (!roundColumns.has('scheduled_at')) db.exec('ALTER TABLE tournament_rounds ADD COLUMN scheduled_at TEXT');
  if (!roundColumns.has('auto_start')) db.exec("ALTER TABLE tournament_rounds ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 1 CHECK(auto_start IN (0, 1));");
  if (!roundColumns.has('submission_deadline')) db.exec('ALTER TABLE tournament_rounds ADD COLUMN submission_deadline TEXT');
  if (!roundColumns.has('submission_started_at')) db.exec('ALTER TABLE tournament_rounds ADD COLUMN submission_started_at TEXT');
  const entryColumns = new Set(db.prepare('PRAGMA table_info(tournament_entries)').all().map(column => column.name));
  if (!entryColumns.has('team_id')) db.exec('ALTER TABLE tournament_entries ADD COLUMN team_id TEXT REFERENCES teams(id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tournament_entries_team ON tournament_entries(team_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON matches(scheduled_at) WHERE scheduled_at IS NOT NULL');
  if (!entryColumns.has('bot_submission_id')) db.exec('ALTER TABLE tournament_entries ADD COLUMN bot_submission_id TEXT');
  const historyColumns = new Set(db.prepare('PRAGMA table_info(tournament_match_history)').all().map(column => column.name));
  if (!historyColumns.has('slot_index')) db.exec('ALTER TABLE tournament_match_history ADD COLUMN slot_index INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE matches SET game_id = 'rps_chess' WHERE game_id = 'ltm-strategy';");
  db.exec("UPDATE games SET active = 0 WHERE id = 'ltm-strategy';");

  let writing = false;
  function transaction(work) {
    if (writing) return work(); // Import owns the outer transaction.
    db.exec('BEGIN IMMEDIATE');
    writing = true;
    try {
      const value = work();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      writing = false;
    }
  }

  function registerTeam({ id, name = id }) {
    id = requireText(id, 'team.id');
    name = requireText(name, 'team.name');
    db.prepare(`INSERT INTO teams VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name`).run(id, name, new Date().toISOString());
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }
  function addTeamMember(teamId, userId, role = 'member') {
    teamId = requireText(teamId, 'teamId'); userId = requireText(userId, 'userId');
    if (!['captain','member'].includes(role)) throw new StorageError('INVALID_INPUT','role must be captain or member');
    try {
      db.prepare(`INSERT INTO team_members(team_id,user_id,role,joined_at) VALUES(?,?,?,?)
        ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role`)
        .run(teamId, userId, role, new Date().toISOString());
      return db.prepare('SELECT team_id,user_id,role,joined_at FROM team_members WHERE team_id=? AND user_id=?').get(teamId, userId);
    } catch (error) {
      if (constraintKind(error) === 'FOREIGNKEY') throw new StorageError('TEAM_OR_USER_NOT_FOUND', 'Team or user not found', 404);
      throw error;
    }
  }
  function getTeamMembers(teamId) {
    return db.prepare(`SELECT tm.team_id,tm.user_id,tm.role,tm.joined_at,u.display_name,u.avatar_url
      FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? ORDER BY tm.joined_at`).all(teamId);
  }
  function getTeam(teamId) {
    const team = db.prepare('SELECT id,name,created_at FROM teams WHERE id=?').get(teamId);
    if (!team) throw new StorageError('TEAM_NOT_FOUND', 'Team not found', 404);
    team.members = getTeamMembers(teamId);
    return team;
  }

  function getMatch(id) {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!row) throw new StorageError('MATCH_NOT_FOUND', 'Match not found', 404);
    const { config_json, initial_state_json, final_state_json, result_json, ...match } = row;
    return { ...match, ranked: Boolean(match.ranked), config: JSON.parse(config_json),
      initial_state: JSON.parse(initial_state_json), final_state: JSON.parse(final_state_json),
      result: result_json === null ? null : JSON.parse(result_json) };
  }

  function startMatch({ id = randomUUID(), roomId, gameId = 'rps_chess', mode, roundId = null,
    teamA, teamB, ranked = true, config = {}, initialState = null, startedAt, scheduledAt = null, autoStart = true }) {
    id = requireText(id, 'match.id');
    roomId = requireText(roomId, 'roomId');
    gameId = requireText(gameId, 'gameId');
    mode ??= ranked ? 'ranked' : 'casual';
    if (!teamA || !teamB || teamA.id === teamB.id || typeof ranked !== 'boolean' ||
        !['casual', 'ranked', 'tournament'].includes(mode) ||
        (mode === 'ranked' && !ranked) || (mode === 'casual' && ranked)) {
      throw new StorageError('INVALID_INPUT', 'Two distinct teams and a boolean ranked are required');
    }
    return transaction(() => {
      if (db.prepare('SELECT id FROM matches WHERE id = ?').get(id)) {
        throw new StorageError('MATCH_EXISTS', 'Match ID already exists', 409);
      }
      const a = registerTeam(teamA), b = registerTeam(teamB);
      db.prepare(`INSERT INTO matches
        (id, room_id, game_id, mode, round_id, team_a_id, team_b_id, status, ranked, started_at,
         scheduled_at, auto_start, config_json, initial_state_json, final_state_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'playing', ?, ?, ?, ?, ?, ?, ?)`).run(
        id, roomId, gameId, mode, roundId, a.id, b.id, Number(ranked), timestamp(startedAt),
        scheduledAt ? timestamp(scheduledAt) : null, Number(autoStart),
        JSON.stringify(config), JSON.stringify(initialState), JSON.stringify(initialState));
      return getMatch(id);
    });
  }

  function appendTurn(id, { turn, player = null, actions = [], events = [], state = null }) {
    if (!Number.isSafeInteger(turn) || turn < 0 || !Array.isArray(actions) || !Array.isArray(events)) {
      throw new StorageError('INVALID_INPUT', 'Invalid turn, actions or events');
    }
    return transaction(() => {
      const match = getMatch(id);
      if (match.status !== 'playing') throw new StorageError('MATCH_CLOSED', 'Match is closed', 409);
      if (player !== null && ![match.team_a_id, match.team_b_id].includes(player)) {
        throw new StorageError('INVALID_INPUT', 'Player is not a match participant');
      }
      const last = db.prepare('SELECT MAX(turn) AS turn FROM match_turns WHERE match_id = ?').get(id).turn;
      if (last !== null && turn <= last) throw new StorageError('STALE_TURN', 'Turn must increase', 409);
      db.prepare('INSERT INTO match_turns VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, turn, player, JSON.stringify(actions), JSON.stringify(events), JSON.stringify(state), new Date().toISOString());
      db.prepare('UPDATE matches SET final_state_json = ? WHERE id = ?').run(JSON.stringify(state), id);
      return { match_id: id, turn };
    });
  }

  // Only an explicit draw or participant winner counts as a completed match.
  function finishMatch(id, result = null, finalState = undefined, endedAt = undefined) {
    return transaction(() => {
      const match = getMatch(id);
      if (match.status !== 'playing') return match; // Repeated callbacks never count twice.
      const winner = result?.winner_team ?? result?.winner ?? null;
      if (winner !== null && ![match.team_a_id, match.team_b_id].includes(winner)) {
        throw new StorageError('INVALID_WINNER', 'Winner must be a participant');
      }
      if (winner !== null && result?.draw === true) {
        throw new StorageError('INVALID_RESULT', 'Draw cannot have a winner');
      }
      const status = winner !== null || result?.draw === true ? 'finished' : 'aborted';
      db.prepare(`UPDATE matches SET status = ?, winner_id = ?, reason = ?, ended_at = ?,
        result_json = ?, final_state_json = ? WHERE id = ?`).run(
        status, winner, result?.reason ?? null, timestamp(endedAt),
        JSON.stringify(result), JSON.stringify(finalState === undefined ? match.final_state : finalState), id);
      if (match.round_id) {
        const round = db.prepare('SELECT tournament_id FROM tournament_rounds WHERE id=?').get(match.round_id);
        if (round) {
          // Lấy tên hiển thị chuẩn: tên User (nếu Đơn) hoặc tên Đội (nếu Đội)
          // Ưu tiên tra cứu từ tournament_entries, fallback sang tên đội từ bảng teams
          const names = db.prepare(`SELECT e.team_id,e.user_id,
            COALESCE(t.name, u.display_name) AS display_name
            FROM tournament_entries e
            LEFT JOIN users u ON u.id=e.user_id
            LEFT JOIN teams t ON t.id=e.team_id
            WHERE e.tournament_id=? AND (e.user_id=? OR e.team_id=? OR e.user_id=? OR e.team_id=?)`).all(
            round.tournament_id, match.team_a_id, match.team_a_id, match.team_b_id, match.team_b_id);
          const byId = {};
          for (const n of names) {
            const id = n.team_id ?? n.user_id;
            byId[id] = n.display_name;
          }
          // Fallback: lấy tên từ bảng teams nếu không tìm thấy trong tournament_entries
          let aName = byId[match.team_a_id];
          let bName = byId[match.team_b_id];
          if (!aName) {
            const team = db.prepare('SELECT name FROM teams WHERE id=?').get(match.team_a_id);
            aName = team?.name ?? match.team_a_id;
          }
          if (!bName) {
            const team = db.prepare('SELECT name FROM teams WHERE id=?').get(match.team_b_id);
            bName = team?.name ?? match.team_b_id;
          }
          recordTournamentMatchInternal({ tournamentId:round.tournament_id,roundId:match.round_id,matchId:id,
            participantAId:match.team_a_id,participantAName:aName,
            participantBId:match.team_b_id,participantBName:bName,
            winnerId:winner,result,playedAt:endedAt });
        }
      }
      return getMatch(id);
    });
  }

  function listMatches({ teamId, status, limit, offset } = {}) {
    limit = pageValue(limit, 20, 100);
    offset = pageValue(offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === 0) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    const clauses = [], args = [];
    if (teamId !== undefined) { clauses.push('(m.team_a_id = ? OR m.team_b_id = ?)'); args.push(teamId, teamId); }
    if (status !== undefined) {
      if (!['playing', 'finished', 'aborted'].includes(status)) throw new StorageError('INVALID_STATUS', 'Invalid status');
      clauses.push('m.status = ?'); args.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM matches m ${where}`).get(...args).total;
    const items = db.prepare(`SELECT m.id, m.room_id, m.team_a_id, m.team_b_id, m.status, m.ranked,
      m.winner_id, m.reason, m.started_at, m.ended_at, a.name AS team_a_name, b.name AS team_b_name
      FROM matches m JOIN teams a ON a.id = m.team_a_id JOIN teams b ON b.id = m.team_b_id ${where}
      ORDER BY m.started_at DESC, m.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
      .map(row => ({ ...row, ranked: Boolean(row.ranked) }));
    return { items, total, limit, offset };
  }

  function getReplay(id) {
    const match = getMatch(id);
    const teams = db.prepare('SELECT id, name FROM teams WHERE id IN (?, ?)').all(match.team_a_id, match.team_b_id);
    const names = Object.fromEntries(teams.map(t => [t.id, t.name]));
    // Renderer and Python engine use team_a/team_b as board-side identifiers.
    const side = value => value === match.team_a_id ? 'team_a' : value === match.team_b_id ? 'team_b' : value;
    function normalize(value) {
      if (Array.isArray(value)) return value.map(normalize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key,
        ['owner', 'player', 'team_id', 'winner_team', 'winner'].includes(key) ? side(val) :
          key === 'scores' ? Object.fromEntries(Object.entries(val).map(([team, score]) => [side(team), score])) : normalize(val)]));
    }
    const turns = db.prepare('SELECT * FROM match_turns WHERE match_id = ? ORDER BY turn').all(id)
      .map(row => normalize({ turn: row.turn, player: row.player, actions: JSON.parse(row.actions_json),
        events: JSON.parse(row.events_json), state: JSON.parse(row.state_json) }));
    return { match_info: { match_id: id, status: match.status, game_id: match.game_id, mode: match.mode,
      teams: { team_a: names[match.team_a_id], team_b: names[match.team_b_id] },
      team_ids: { team_a: match.team_a_id, team_b: match.team_b_id },
      winner: side(match.winner_id), win_reason: match.reason, total_turns: turns.length,
      final_scores: { team_a: match.winner_id === match.team_a_id ? 1 : 0,
        team_b: match.winner_id === match.team_b_id ? 1 : 0 } },
      game_config: normalize(match.config), initial_state: normalize(match.initial_state), turns,
      final_state: normalize(match.final_state) };
  }

  function importReplay(replay, { roomId = 'offline', gameId = 'rps_chess', mode, roundId = null,
    ranked = true, teamAId, teamBId, startedAt, endedAt } = {}) {
    const info = replay?.match_info;
    const board = replay?.game_config?.board;
    if (!info || !board || !Number.isInteger(board.width) || board.width < 1 ||
        !Number.isInteger(board.height) || board.height < 1 ||
        !Array.isArray(replay.initial_state) || !Array.isArray(replay.turns)) {
      throw new StorageError('INVALID_REPLAY', 'Replay requires match_info, board, initial_state and turns');
    }
    const a = requireText(teamAId ?? info.team_ids?.team_a ?? info.teams?.team_a, 'teamAId');
    const b = requireText(teamBId ?? info.team_ids?.team_b ?? info.teams?.team_b, 'teamBId');
    const resolveTeam = value => value === 'team_a' ? a : value === 'team_b' ? b : value;
    const winner = resolveTeam(info.winner);
    const draw = info.winner === null && info.win_reason === 'DRAW';
    if (!draw && ![a, b].includes(winner)) throw new StorageError('INVALID_REPLAY', 'Replay must have a participant winner or explicit DRAW');
    const ending = replay.turns.flatMap(turn => turn.events ?? []).filter(event => event.type === 'GAME_OVER').at(-1);
    if (ending && (resolveTeam(ending.winner_team ?? ending.winner ?? null) !== (winner ?? null) ||
        (ending.reason != null && ending.reason !== info.win_reason))) {
      throw new StorageError('INVALID_REPLAY', 'GAME_OVER disagrees with match_info');
    }
    return transaction(() => {
      const match = startMatch({ id: requireText(info.match_id, 'match_id'), roomId,
        teamA: { id: a, name: info.teams?.team_a ?? a }, teamB: { id: b, name: info.teams?.team_b ?? b },
        ranked, gameId, mode, roundId, config: replay.game_config, initialState: replay.initial_state,
        startedAt: startedAt ?? info.started_at });
      let frames = createFrames(replay);
      const pieces = () => Object.values(frames.at(-1).pieces).filter(piece => piece.alive)
        .map(({ alive, ...piece }) => piece);
      for (const turn of replay.turns) {
        frames = appendReplayTurn(frames, turn);
        appendTurn(match.id, { ...turn, player: resolveTeam(turn.player ?? null), state: turn.state ?? pieces() });
      }
      return finishMatch(match.id, { winner: winner ?? null, draw, reason: info.win_reason ?? null },
        replay.final_state ?? pieces(), endedAt ?? info.ended_at);
    });
  }

  function getRankings() {
    const rows = db.prepare(`SELECT t.id AS team_id, t.name,
      COUNT(m.id) AS played,
      SUM(CASE WHEN m.winner_id = t.id THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN m.id IS NOT NULL AND m.winner_id IS NULL THEN 1 ELSE 0 END) AS draws,
      SUM(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id <> t.id THEN 1 ELSE 0 END) AS losses
      FROM teams t LEFT JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id)
        AND m.status = 'finished' AND m.ranked = 1
      GROUP BY t.id`).all().map(row => ({ ...row, points: row.wins * 3 + row.draws,
        win_rate: row.played ? row.wins / row.played : 0 }));
    rows.sort((a, b) => b.points - a.points || b.wins - a.wins || b.win_rate - a.win_rate || a.team_id.localeCompare(b.team_id));
    let rank = 0;
    return rows.map((row, index) => {
      const previous = rows[index - 1];
      if (!previous || row.points !== previous.points || row.wins !== previous.wins || row.win_rate !== previous.win_rate) rank = index + 1;
      return { rank, ...row };
    });
  }

  function listGames() {
    return db.prepare('SELECT id, name, default_config_json, active FROM games WHERE active = 1 ORDER BY name, id')
      .all().map(row => ({ id: row.id, name: row.name,
        default_config: JSON.parse(row.default_config_json), active: Boolean(row.active) }));
  }

  function upsertUser(user) {
    const id = requireText(user?.id, 'user.id');
    const displayName = requireText(user?.display_name ?? user?.id, 'user.display_name');
    const role = ['player', 'organizer', 'admin'].includes(user.role) ? user.role : 'player';
    db.prepare(`INSERT INTO users(id, display_name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, avatar_url=excluded.avatar_url`)
      .run(id, displayName, user.avatar_url ?? null, role, new Date().toISOString());
    return db.prepare('SELECT id, display_name, avatar_url, role, banned FROM users WHERE id = ?').get(id);
  }

  function authUser(row) { return row ? { ...row, guest: Boolean(row.guest) } : null; }
  function getAuthUser(id) { return authUser(db.prepare('SELECT id,display_name,avatar_url,email,phone,role,banned,password_salt,password_hash,guest FROM users WHERE id=?').get(id)); }
  function findAuthUser(identifier) { return authUser(db.prepare('SELECT id,display_name,avatar_url,email,phone,role,banned,password_salt,password_hash,guest FROM users WHERE email=? OR phone=?').get(identifier, identifier)); }
  function createAuthUser(user) {
    const id = user.id ?? randomUUID();
    db.prepare(`INSERT INTO users(id,display_name,avatar_url,email,phone,password_salt,password_hash,role,guest,created_at)
      VALUES(?,?,?,?,?,?,?,'player',?,?)`).run(id,user.display_name,user.avatar_url??null,user.email??null,user.phone??null,user.password_salt??null,user.password_hash??null,user.guest?1:0,new Date().toISOString());
    return getAuthUser(id);
  }
  function updateAuthPassword(id, salt, hash) { db.prepare('UPDATE users SET password_salt=?,password_hash=? WHERE id=?').run(salt,hash,id); return getAuthUser(id); }
  function getAuthIdentity(provider, providerUserId) { return db.prepare('SELECT user_id FROM auth_identities WHERE provider=? AND provider_user_id=?').get(provider,providerUserId) ?? null; }
  function addAuthIdentity({ userId, provider, providerUserId, email = null }) {
    db.prepare('INSERT INTO auth_identities(user_id,provider,provider_user_id,email) VALUES(?,?,?,?)').run(userId,provider,providerUserId,email);
    return { user_id:userId, provider, provider_user_id:providerUserId, email };
  }
  function listAuthIdentities(userId) { return db.prepare('SELECT provider,email FROM auth_identities WHERE user_id=? ORDER BY provider').all(userId); }
  function saveAuthSession({ tokenHash,userId,expiresAt }) { db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(tokenHash,userId,new Date(expiresAt).toISOString(),new Date().toISOString()); }
  function getAuthSession(tokenHash) { const row=db.prepare('SELECT user_id,expires_at FROM auth_sessions WHERE token_hash=?').get(tokenHash); return row?{userId:row.user_id,expiresAt:Date.parse(row.expires_at)}:null; }
  function deleteAuthSession(tokenHash) { db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash); }

  function listTournaments({ status, limit, offset } = {}) {
    limit = pageValue(limit, 20, 100);
    offset = pageValue(offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === 0) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    if (status !== undefined && !['draft', 'open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      throw new StorageError('INVALID_STATUS', 'Invalid tournament status');
    }
    const where = status === undefined ? '' : 'WHERE t.status = ?';
    const args = status === undefined ? [] : [status];
    const total = db.prepare(`SELECT COUNT(*) AS total FROM tournaments t ${where}`).get(...args).total;
    const items = db.prepare(`SELECT t.id, t.game_id, g.name AS game_name, t.code, t.name, t.format,
      t.status, t.config_json, t.starts_at, t.champion_id, t.created_at,
      (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id) AS participant_count,
      (SELECT MAX(h.played_at) FROM tournament_match_history h WHERE h.tournament_id = t.id) AS ended_at
      FROM tournaments t JOIN games g ON g.id = t.game_id ${where}
      ORDER BY t.starts_at IS NULL, t.starts_at, t.created_at DESC, t.id LIMIT ? OFFSET ?`)
      .all(...args, limit, offset).map(row => {
        const { config_json, ...item } = row;
        return { ...item, config: JSON.parse(config_json) };
      });
    return { items, total, limit, offset };
  }

  function listTournamentEntries(tournamentId) {
    const entries = db.prepare(`SELECT e.tournament_id,e.user_id,e.team_id,e.seed,e.points,e.bot_submission_id,
      u.display_name AS user_display_name,u.avatar_url,u.role,
      t.name AS team_name
      FROM tournament_entries e
      LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN teams t ON t.id=e.team_id
      WHERE e.tournament_id=?
      ORDER BY e.seed IS NULL, e.seed, COALESCE(t.name,u.display_name)`).all(tournamentId);
    return entries.map(e => ({
      ...e,
      display_name: e.team_name ?? e.user_display_name,
    }));
  }

  function listTournamentRounds(tournamentId) {
    const rounds = db.prepare('SELECT id, round_no, status, scheduled_at, auto_start, submission_started_at, submission_deadline FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_no').all(tournamentId);
    for (const round of rounds) round.matches = db.prepare(`SELECT id,match_id,slot_index,participant_a_id,participant_a_name,
      participant_b_id,participant_b_name,winner_id,result_json,played_at FROM tournament_match_history WHERE round_id=? ORDER BY slot_index,id`)
      .all(round.id).map(item=>({id:item.id,match_id:item.match_id,slot_index:item.slot_index,round_id:round.id,
        participant_a_id:item.participant_a_id,participant_a_name:item.participant_a_name,
        participant_b_id:item.participant_b_id,participant_b_name:item.participant_b_name,
        winner_id:item.winner_id,result:item.result_json?JSON.parse(item.result_json):null,played_at:item.played_at}));
    return rounds;
  }

  function getTournament(id) {
    const row = db.prepare(`SELECT t.id, t.game_id, g.name AS game_name, t.code, t.name, t.format,
      t.status, t.config_json, t.starts_at, t.champion_id, t.created_at,
      (SELECT MAX(h.played_at) FROM tournament_match_history h WHERE h.tournament_id = t.id) AS ended_at
      FROM tournaments t JOIN games g ON g.id = t.game_id WHERE t.id = ? OR t.code = ?`).get(id, id);
    if (!row) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    const rounds = listTournamentRounds(row.id);
    const entries = listTournamentEntries(row.id);
    const { config_json, ...tournament } = row;
    const champion = tournament.champion_id ? db.prepare(`SELECT CASE WHEN winner_id=participant_a_id THEN participant_a_name ELSE participant_b_name END AS name
      FROM tournament_match_history WHERE tournament_id=? AND winner_id=? ORDER BY played_at DESC LIMIT 1`).get(row.id,tournament.champion_id) : null;
    return { ...tournament, champion:champion?{id:tournament.champion_id,name:champion.name}:null, config: JSON.parse(config_json),
      participant_count: entries.length, rounds, entries,
      bracket: tournament.format === 'single_elimination' ? buildBracket({ rounds, entryCount: entries.length }) : null };
  }

  function invalidateTournamentNotificationSync() { db.prepare('DELETE FROM tournament_notification_sync').run(); }

  function listTournamentNotifications(userId, { limit = 100, offset = 0 } = {}) {
    userId = requireText(userId, 'userId'); limit = pageValue(limit, 100, 200); offset = pageValue(offset, 0, Number.MAX_SAFE_INTEGER);
    if (!limit) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    const sync = db.prepare('SELECT synced_at FROM tournament_notification_sync WHERE user_id=?').get(userId);
    const shouldSync = !sync || Date.now() - Date.parse(sync.synced_at) >= 60_000;
    if (shouldSync) {
    const upsert = db.prepare(`INSERT INTO tournament_notifications
      (id,user_id,tournament_id,event_key,type,title,message,scheduled_at,metadata_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,event_key) DO UPDATE SET
      tournament_id=excluded.tournament_id,type=excluded.type,title=excluded.title,message=excluded.message,
      scheduled_at=excluded.scheduled_at,metadata_json=excluded.metadata_json`);
    const dateText = value => value ? new Date(value).toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' }) : null;
    const memberCache = new Map();
    const memberIds = teamId => {
      if (!memberCache.has(teamId)) memberCache.set(teamId, getTeamMembers(teamId).map(m => m.user_id));
      return memberCache.get(teamId);
    };
    for (const { id } of db.prepare('SELECT id FROM tournaments').all()) {
      const tournament = getTournament(id), recipients = new Set(), events = [];
      if (tournament.config?.organizerId) recipients.add(tournament.config.organizerId);
      for (const entry of tournament.entries) {
        if (entry.user_id) recipients.add(entry.user_id);
        if (entry.team_id) for (const memberId of memberIds(entry.team_id)) recipients.add(memberId);
      }
      if (['draft','open','in_progress'].includes(tournament.status)) {
        const opensAt = tournament.config?.registrationOpensAt ? Date.parse(tournament.config.registrationOpensAt) : null;
        const closesAt = tournament.config?.registrationClosesAt ? Date.parse(tournament.config.registrationClosesAt) : null;
        const registrationOpen = tournament.status === 'open' && (opensAt === null || Date.now() >= opensAt) && (closesAt === null || Date.now() <= closesAt);
        const phase = tournament.status === 'in_progress' ? 'đang diễn ra' : tournament.status === 'draft' ? 'dự kiến' : registrationOpen ? 'đang mở đơn' : 'sắp diễn ra';
        events.push({ key:`tournament:schedule:${tournament.status}`, type:'schedule', title:`${tournament.name} — ${phase}`,
          message:`Giải ${tournament.name} ${phase}${tournament.starts_at ? `, bắt đầu lúc ${dateText(tournament.starts_at)}` : ''}.`,
          scheduled:tournament.starts_at, metadata:{ status:tournament.status, registrationOpen } });
      }
      if (recipients.has(userId) && tournament.status === 'completed') events.push({ key:'tournament:completed', type:'status', title:`${tournament.name} đã kết thúc`,
        message:`Giải đấu đã kết thúc${tournament.champion?.name ? `. Nhà vô địch: ${tournament.champion.name}.` : '.'}` });
      if (!recipients.has(userId)) {
        for (const event of events) upsert.run(randomUUID(), userId, tournament.id, event.key, event.type, event.title,
          event.message, event.scheduled ?? null, JSON.stringify(event.metadata ?? {}), new Date().toISOString());
        continue;
      }
      for (const round of tournament.rounds) for (const match of round.matches) {
        const isA = match.participant_a_id === userId || memberIds(match.participant_a_id).includes(userId);
        const isB = match.participant_b_id === userId || memberIds(match.participant_b_id).includes(userId);
        if (!isA && !isB) continue;
        const opponent = isA ? match.participant_b_name : match.participant_a_name, label = `Vòng ${round.round_no} — ${tournament.name}`;
        if (!match.winner_id) events.push({ key:`match:${match.id}:scheduled`, type:'match', title:`${label}: trận cần tham gia`,
          message:`Bạn sẽ đấu với ${opponent}${round.scheduled_at ? ` lúc ${dateText(round.scheduled_at)}` : ''}.`, scheduled:round.scheduled_at,
          metadata:{ roundNo:round.round_no, matchId:match.match_id } });
        else {
          const won = match.winner_id === (isA ? match.participant_a_id : match.participant_b_id);
          events.push({ key:`match:${match.id}:result`, type:'result', title:`${label}: ${won ? 'chiến thắng' : 'thất bại'}`,
            message:`Bạn ${won ? 'thắng' : 'thua'} trước ${opponent}${match.played_at ? ` (${dateText(match.played_at)})` : ''}.`,
            scheduled:match.played_at, metadata:{ roundNo:round.round_no, matchId:match.match_id, winnerId:match.winner_id } });
        }
      }
      const created = new Date().toISOString();
      for (const event of events) upsert.run(randomUUID(), userId, tournament.id, event.key, event.type, event.title,
        event.message, event.scheduled ?? null, JSON.stringify(event.metadata ?? {}), created);
    }
    db.prepare(`INSERT INTO tournament_notification_sync(user_id,synced_at) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET synced_at=excluded.synced_at`).run(userId, new Date().toISOString());
    }
    const total = db.prepare('SELECT COUNT(*) AS total FROM tournament_notifications WHERE user_id=?').get(userId).total;
    const unread = db.prepare('SELECT COUNT(*) AS total FROM tournament_notifications WHERE user_id=? AND read_at IS NULL').get(userId).total;
    const items = db.prepare(`SELECT n.id,n.user_id,n.tournament_id,t.game_id,n.event_key,n.type,n.title,n.message,n.scheduled_at,n.metadata_json,n.created_at,n.read_at
      FROM tournament_notifications n LEFT JOIN tournaments t ON t.id=n.tournament_id
      WHERE n.user_id=? ORDER BY COALESCE(n.scheduled_at,n.created_at) DESC,n.created_at DESC LIMIT ? OFFSET ?`)
      .all(userId, limit, offset).map(row => { const { metadata_json, ...item } = row; return { ...item, metadata: JSON.parse(metadata_json) }; });
    return { items, total, unread, limit, offset };
  }
  function markTournamentNotificationRead(userId, notificationId) {
    const result = db.prepare('UPDATE tournament_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?')
      .run(new Date().toISOString(), notificationId, userId);
    if (!result.changes) throw new StorageError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    return { id:notificationId, read:true };
  }

  function createTournament({ id = randomUUID(), gameId, code, name, format, config = {}, startsAt = null, status = 'open' }) {
    gameId = requireText(gameId, 'gameId'); code = requireText(code, 'code').toUpperCase();
    name = requireText(name, 'name');
    if (!/^[A-Z0-9-]{3,24}$/.test(code) || name.length > 100 ||
        !['single_elimination', 'round_robin', 'swiss'].includes(format) ||
        !['draft', 'open'].includes(status) ||
        !config || typeof config !== 'object' || Array.isArray(config)) {
      throw new StorageError('INVALID_INPUT', 'Invalid tournament data');
    }
    const createdAt = new Date().toISOString();
    const beginsAt = startsAt === null ? null : timestamp(startsAt);
    try {
      db.prepare(`INSERT INTO tournaments (id, game_id, code, name, format, status, config_json, starts_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, gameId, code, name, format, status, JSON.stringify(config), beginsAt, createdAt);
    } catch (error) {
      if (constraintKind(error) === 'FOREIGNKEY') throw new StorageError('GAME_NOT_FOUND', 'Game not found', 404);
      if (constraintKind(error) === 'UNIQUE') throw new StorageError('TOURNAMENT_EXISTS', 'Tournament code already exists', 409);
      throw error;
    }
    invalidateTournamentNotificationSync();
    return getTournament(id);
  }

  function createTournamentRound(tournamentId, { id = randomUUID(), roundNo, scheduledAt = null, autoStart = true }) {
    if (!Number.isSafeInteger(roundNo) || roundNo < 1) throw new StorageError('INVALID_INPUT', 'roundNo must be a positive integer');
    try {
      db.prepare('INSERT INTO tournament_rounds (id, tournament_id, round_no, scheduled_at, auto_start) VALUES (?, ?, ?, ?, ?)')
        .run(id, tournamentId, roundNo, scheduledAt ? timestamp(scheduledAt) : null, Number(autoStart));
    } catch (error) {
      if (constraintKind(error) === 'FOREIGNKEY') throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
      if (constraintKind(error) === 'UNIQUE') throw new StorageError('ROUND_EXISTS', 'Round number already exists', 409);
      throw error;
    }
    invalidateTournamentNotificationSync();
    return db.prepare('SELECT id, tournament_id, round_no, status, scheduled_at, auto_start FROM tournament_rounds WHERE id = ?').get(id);
  }

  function updateTournamentSchedule(tournamentId, scheduledAt) {
    db.prepare('UPDATE tournaments SET starts_at = ? WHERE id = ?').run(scheduledAt ? timestamp(scheduledAt) : null, tournamentId);
    invalidateTournamentNotificationSync();
    return getTournament(tournamentId);
  }

  // Chủ giải sửa khung mở/đóng đơn; chỉ khi giải còn đang mở đơn.
  function updateTournamentRegistrationWindow(tournamentId, { registrationOpensAt, registrationClosesAt, startsAt } = {}) {
    const row = db.prepare('SELECT status, config_json, starts_at FROM tournaments WHERE id = ?').get(tournamentId);
    if (!row) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    if (row.status !== 'open') {
      throw new StorageError('TOURNAMENT_STARTED', 'Giải đã khởi tranh, không sửa được khung đăng ký', 409);
    }
    const opensAt = timestamp(requireText(registrationOpensAt, 'registrationOpensAt'));
    const closesAt = timestamp(requireText(registrationClosesAt, 'registrationClosesAt'));
    if (Date.parse(closesAt) <= Date.parse(opensAt)) {
      throw new StorageError('INVALID_INPUT', 'registrationClosesAt phải sau registrationOpensAt');
    }
    const config = { ...JSON.parse(row.config_json ?? '{}'), registrationOpensAt: opensAt, registrationClosesAt: closesAt };
    const beginsAt = startsAt === undefined || startsAt === null ? row.starts_at : timestamp(startsAt);
    // Mốc khởi tranh (giữ nguyên hoặc mới) luôn phải sau đóng đơn.
    if (beginsAt && Date.parse(beginsAt) <= Date.parse(closesAt)) {
      throw new StorageError('KICKOFF_BEFORE_CLOSE', 'Ngày khởi tranh phải sau thời gian đóng đơn', 400);
    }
    db.prepare('UPDATE tournaments SET config_json = ?, starts_at = ? WHERE id = ?')
      .run(JSON.stringify(config), beginsAt, tournamentId);
    invalidateTournamentNotificationSync();
    return getTournament(tournamentId);
  }

  // Giải có lịch khởi tranh tới hạn, đã đóng đơn, còn open, chưa có sơ đồ.
  function listAutoStartDue(now = Date.now()) {
    const rows = db.prepare(
      "SELECT id, starts_at, config_json FROM tournaments WHERE status = 'open' AND format = 'single_elimination' AND starts_at IS NOT NULL"
    ).all();
    const due = [];
    for (const row of rows) {
      if (new Date(row.starts_at).getTime() > now) continue;
      const config = JSON.parse(row.config_json ?? '{}');
      if (config.registrationClosesAt && now < new Date(config.registrationClosesAt).getTime()) continue;
      if (db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id = ? LIMIT 1').get(row.id)) continue;
      due.push(row.id);
    }
    return due;
  }

  // Các vòng pending đã chủ giải đặt giờ tới hạn, vòng trước đã xong.
  function listRoundsDueToStart(now = Date.now()) {
    const rows = db.prepare(`SELECT r.id, r.tournament_id, r.round_no, r.scheduled_at, r.auto_start, t.config_json
      FROM tournament_rounds r JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.status = 'pending' AND r.auto_start = 1 AND r.scheduled_at IS NOT NULL AND r.submission_started_at IS NULL`).all();
    const due = [];
    for (const row of rows) {
      if (Date.parse(row.scheduled_at) > now) continue;
      const prev = db.prepare('SELECT status FROM tournament_rounds WHERE tournament_id = ? AND round_no = ?').get(row.tournament_id, row.round_no - 1);
      if (!prev || prev.status !== 'completed') continue;
      due.push({ id: row.id, tournament_id: row.tournament_id, round_no: row.round_no });
    }
    return due;
  }

  function updateRoundSchedule(tournamentId, roundId, scheduledAt, autoStart) {
    db.prepare('UPDATE tournament_rounds SET scheduled_at = ?, auto_start = ? WHERE id = ? AND tournament_id = ?')
      .run(scheduledAt ? timestamp(scheduledAt) : null, Number(autoStart), roundId, tournamentId);
    invalidateTournamentNotificationSync();
    return db.prepare('SELECT id, tournament_id, round_no, status, scheduled_at, auto_start FROM tournament_rounds WHERE id = ?').get(roundId);
  }

  function triggerRoundStart(tournamentId, roundId) {
    // Mở vòng ngay: bật trạng thái, ghi giờ bắt đầu và cửa sổ nộp code mới.
    return transaction(() => {
      const row = db.prepare('SELECT id, tournament_id, round_no, status FROM tournament_rounds WHERE id = ? AND tournament_id = ?')
        .get(roundId, tournamentId);
      if (!row) throw new StorageError('ROUND_NOT_FOUND', 'Tournament round not found', 404);
      if (row.status === 'completed') throw new StorageError('ROUND_COMPLETED', 'Vòng đấu đã kết thúc.', 409);
      if (row.round_no > 1) {
        const prev = db.prepare('SELECT status FROM tournament_rounds WHERE tournament_id = ? AND round_no = ?').get(tournamentId, row.round_no - 1);
        if (!prev || prev.status !== 'completed') {
          throw new StorageError('PREV_ROUND_UNFINISHED', 'Vòng trước chưa kết thúc nên chưa thể mở vòng này.', 409);
        }
      }
      const config = JSON.parse(db.prepare('SELECT config_json FROM tournaments WHERE id = ?').get(tournamentId).config_json ?? '{}');
      const windowMinutes = Number(config.submissionWindowMinutes) || 10;
      const nowIso = new Date().toISOString();
      const deadlineIso = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
      db.prepare(`UPDATE tournament_rounds SET status = 'in_progress', scheduled_at = ?, auto_start = 1,
        submission_started_at = ?, submission_deadline = ? WHERE id = ? AND tournament_id = ?`)
        .run(nowIso, nowIso, deadlineIso, roundId, tournamentId);
      return db.prepare('SELECT id, tournament_id, round_no, status, scheduled_at, auto_start, submission_started_at, submission_deadline FROM tournament_rounds WHERE id = ?').get(roundId);
    });
  }

  function rescheduleMatch(matchId, scheduledAt) {
    db.prepare('UPDATE matches SET scheduled_at = ? WHERE id = ?').run(scheduledAt ? timestamp(scheduledAt) : null, matchId);
    return getMatch(matchId);
  }

  function recordTournamentMatchInternal({id=randomUUID(),tournamentId,roundId,matchId=null,participantAId,participantAName,
    participantBId,participantBName,winnerId=null,result=null,playedAt}) {
    tournamentId=requireText(tournamentId,'tournamentId'); roundId=requireText(roundId,'roundId');
    participantAId=requireText(participantAId,'participantAId'); participantBId=requireText(participantBId,'participantBId');
    participantAName=requireText(participantAName??participantAId,'participantAName'); participantBName=requireText(participantBName??participantBId,'participantBName');
    if(participantAId===participantBId||winnerId!==null&&![participantAId,participantBId].includes(winnerId)) throw new StorageError('INVALID_TOURNAMENT_RESULT','Invalid participants or winner');
    if(!db.prepare('SELECT id FROM tournament_rounds WHERE id=? AND tournament_id=?').get(roundId,tournamentId)) throw new StorageError('ROUND_NOT_FOUND','Tournament round not found',404);
    db.prepare(`INSERT INTO tournament_match_history(id,tournament_id,round_id,match_id,participant_a_id,participant_a_name,
      participant_b_id,participant_b_name,winner_id,result_json,played_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(match_id) DO UPDATE SET winner_id=excluded.winner_id,result_json=excluded.result_json,played_at=excluded.played_at`)
      .run(id,tournamentId,roundId,matchId,participantAId,participantAName,participantBId,participantBName,winnerId,
        result===null?null:JSON.stringify(result),timestamp(playedAt));
    invalidateTournamentNotificationSync();
    return db.prepare(`SELECT id,tournament_id,round_id,match_id,participant_a_id,participant_a_name,participant_b_id,
      participant_b_name,winner_id,result_json,played_at FROM tournament_match_history WHERE (match_id IS ? AND ? IS NOT NULL) OR id=?`)
      .get(matchId,matchId,id);
  }
  function recordTournamentMatch(input) { return transaction(()=>recordTournamentMatchInternal(input)); }

  function addTournamentEntry(tournamentId, { userId = null, teamId = null, seed = null, botSubmissionId = null }) {
    if (!userId && !teamId) throw new StorageError('INVALID_INPUT', 'Either userId or teamId is required');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 1)) throw new StorageError('INVALID_INPUT', 'seed must be a positive integer');
    const tournament = db.prepare('SELECT id, status, config_json FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    if (tournament.status !== 'open') throw new StorageError('TOURNAMENT_NOT_OPEN', 'Tournament is not accepting entries', 409);
    const config = JSON.parse(tournament.config_json ?? '{}');
    assertRegistrationWindowOpen(config);
    const participantMode = config.participantMode ?? 'INDIVIDUAL';
    if (participantMode === 'TEAM' && !teamId) throw new StorageError('INVALID_INPUT', 'Team mode requires a teamId');
    if (participantMode === 'INDIVIDUAL' && !userId) throw new StorageError('INVALID_INPUT', 'Individual mode requires a userId');
    // Seed mặc định = thứ tự đăng ký, dùng để xếp nhánh đấu.
    seed ??= db.prepare('SELECT COUNT(*) AS total FROM tournament_entries WHERE tournament_id = ?').get(tournamentId).total + 1;
    try {
      if (teamId) {
        db.prepare('INSERT INTO tournament_entries (tournament_id, user_id, team_id, seed, bot_submission_id) VALUES (?, ?, ?, ?, ?)')
          .run(tournamentId, userId, teamId, seed, botSubmissionId);
        invalidateTournamentNotificationSync();
        return db.prepare('SELECT tournament_id, user_id, team_id, seed, points, bot_submission_id FROM tournament_entries WHERE tournament_id = ? AND team_id = ?')
          .get(tournamentId, teamId);
      }
      db.prepare('INSERT INTO tournament_entries (tournament_id, user_id, seed) VALUES (?, ?, ?)').run(tournamentId, userId, seed);
      invalidateTournamentNotificationSync();
      return db.prepare('SELECT tournament_id, user_id, seed, points FROM tournament_entries WHERE tournament_id = ? AND user_id = ?').get(tournamentId, userId);
    } catch (error) {
      if (constraintKind(error) === 'FOREIGNKEY') {
        if (teamId) throw new StorageError('TEAM_NOT_FOUND', 'Team not found', 404);
        throw new StorageError('USER_OR_TOURNAMENT_NOT_FOUND', 'User or tournament not found', 404);
      }
      if (constraintKind(error) === 'PRIMARYKEY' || constraintKind(error) === 'UNIQUE') throw new StorageError('ENTRY_EXISTS', 'User already joined this tournament', 409);
      throw error;
    }
  }

  function setEntrySubmission(tournamentId, { userId = null, teamId = null, submissionId }) {
    if (!teamId && !userId) throw new StorageError('INVALID_INPUT', 'teamId or userId is required');
    if (!submissionId) throw new StorageError('INVALID_INPUT', 'submissionId is required');
    const info = db.prepare(`UPDATE tournament_entries SET bot_submission_id = ?
      WHERE tournament_id = ? AND (team_id = ? OR user_id = ?)`).run(submissionId, tournamentId, teamId, userId);
    if (!info.changes) throw new StorageError('ENTRY_NOT_FOUND', 'Tournament entry not found', 404);
    return db.prepare('SELECT tournament_id, user_id, team_id, bot_submission_id FROM tournament_entries WHERE tournament_id = ? AND (team_id = ? OR user_id = ?)')
      .get(tournamentId, teamId, userId);
  }

  function updateTournamentStatus(id, status, championId = null) {
    const transitions = { draft: ['open', 'cancelled'], open: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] };
    const current = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(id);
    if (!current) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    if (!transitions[current.status]?.includes(status)) throw new StorageError('INVALID_STATUS_TRANSITION', 'Tournament status transition is not allowed', 409);
    if(status==='completed') {
      if(!championId) {
        const round=db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id=? ORDER BY round_no DESC LIMIT 1').get(id);
        const winners=round?db.prepare('SELECT DISTINCT winner_id FROM tournament_match_history WHERE round_id=? AND winner_id IS NOT NULL').all(round.id):[];
        if(winners.length===1) championId=winners[0].winner_id;
      }
      if(!championId) throw new StorageError('CHAMPION_REQUIRED','A completed tournament must have a champion');
      if(!db.prepare('SELECT id FROM tournament_match_history WHERE tournament_id=? AND winner_id=?').get(id,championId)) throw new StorageError('INVALID_CHAMPION','Champion must have won a recorded tournament match');
    } else if(championId) throw new StorageError('INVALID_INPUT','Champion can only be set when completing a tournament');
    db.prepare('UPDATE tournaments SET status = ?, champion_id = ? WHERE id = ?').run(status,status==='completed'?championId:null,id);
    invalidateTournamentNotificationSync();
    return getTournament(id);
  }

  function insertHistorySlot({ tournamentId, roundId, slotIndex, a, b, winnerId = null, result = null, matchId = null, playedAt }) {
    db.prepare(`INSERT INTO tournament_match_history(id,tournament_id,round_id,match_id,slot_index,participant_a_id,participant_a_name,
      participant_b_id,participant_b_name,winner_id,result_json,played_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), tournamentId, roundId, matchId, slotIndex, a.id, a.name, b.id, b.name, winnerId,
        result === null ? null : JSON.stringify(result), timestamp(playedAt));
  }

  function promoteWinner({ tournamentId, roundIds, totalRounds, roundNo, slotIndex, winner }) {
    if (roundNo >= totalRounds) return;
    const next = nextSlotOf(roundNo, slotIndex);
    const siblingIndex = next.slotIndex * 2 + (next.side === 'a' ? 1 : 0);
    const sibling = db.prepare(`SELECT winner_id, participant_a_id, participant_a_name, participant_b_id, participant_b_name
      FROM tournament_match_history WHERE round_id = ? AND slot_index = ?`).get(roundIds[roundNo - 1], siblingIndex);
    if (!sibling?.winner_id) return;
    if (db.prepare('SELECT id FROM tournament_match_history WHERE round_id = ? AND slot_index = ?')
      .get(roundIds[next.roundNo - 1], next.slotIndex)) return;
    const other = {
      id: sibling.winner_id,
      name: sibling.winner_id === sibling.participant_a_id ? sibling.participant_a_name : sibling.participant_b_name,
    };
    if (other.id === winner.id) return;
    insertHistorySlot({
      tournamentId, roundId: roundIds[next.roundNo - 1], slotIndex: next.slotIndex,
      a: next.side === 'a' ? winner : other, b: next.side === 'b' ? winner : other,
      playedAt: new Date().toISOString(),
    });
  }

  function refreshRoundStatuses({ tournamentId, totalRounds, entryCount }) {
    for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
      const round = db.prepare('SELECT id, submission_started_at FROM tournament_rounds WHERE tournament_id = ? AND round_no = ?').get(tournamentId, roundNo);
      if (!round) continue;
      const rows = db.prepare('SELECT winner_id FROM tournament_match_history WHERE round_id = ?').all(round.id);
      const expected = slotCount(entryCount, roundNo);
      const decided = rows.filter(row => row.winner_id).length;
      // Chỉ tính là đang diễn ra khi cửa sổ nộp code đã mở; chưa mở vẫn chờ (pending).
      const status = rows.length >= expected && decided >= expected ? 'completed'
        : rows.length > 0 && round.submission_started_at ? 'in_progress' : 'pending';
      db.prepare('UPDATE tournament_rounds SET status = ? WHERE id = ?').run(status, round.id);
    }
  }

  function generateTournamentBracket(tournamentId) {
    return transaction(() => {
      const tournament = db.prepare('SELECT id, format, status, config_json, starts_at FROM tournaments WHERE id = ?').get(tournamentId);
      if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
      if (tournament.format !== 'single_elimination') {
        throw new StorageError('FORMAT_NOT_SUPPORTED', 'Chỉ thể thức loại trực tiếp mới tạo được nhánh đấu', 409);
      }
      if (!['open', 'in_progress'].includes(tournament.status)) {
        throw new StorageError('INVALID_STATUS_TRANSITION', 'Chỉ tạo được nhánh khi giải đang mở đăng ký hoặc đang diễn ra', 409);
      }
      assertRegistrationClosed(JSON.parse(tournament.config_json ?? '{}'));
      if (db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id = ? LIMIT 1').get(tournamentId)) {
        throw new StorageError('BRACKET_EXISTS', 'Sơ đồ nhánh của giải đã được tạo trước đó', 409);
      }
      const rawEntries = listTournamentEntries(tournamentId);
      const entries = rawEntries.map((entry, index) => ({
        id: entry.team_id ?? entry.user_id,
        name: entry.display_name,
        seed: entry.seed ?? index + 1,
      }));
      if (entries.length < 2) throw new StorageError('NOT_ENOUGH_PARTICIPANTS', 'Cần ít nhất 2 người đăng ký để tạo nhánh đấu', 409);

      const { totalRounds } = planSize(entries.length);
      const config = JSON.parse(tournament.config_json ?? '{}');
      const windowMinutes = Number(config.submissionWindowMinutes) || 10;
      const nowIso = new Date().toISOString();
      const deadlineIso = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
      // Vòng 1 mở ngay theo ngày khởi tranh; các vòng sau chờ chủ giải đặt giờ hoặc bấm mở trong bảng điều khiển.
      const roundOneAt = tournament.starts_at ?? nowIso;
      const roundIds = [];
      for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
        const roundId = randomUUID();
        db.prepare('INSERT INTO tournament_rounds (id, tournament_id, round_no, status, submission_started_at, submission_deadline, scheduled_at, auto_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(roundId, tournamentId, roundNo, roundNo === 1 ? 'in_progress' : 'pending',
            roundNo === 1 ? nowIso : null, roundNo === 1 ? deadlineIso : null,
            roundNo === 1 ? roundOneAt : null, roundNo === 1 ? 1 : 0);
        roundIds.push(roundId);
      }

      const startedAt = new Date().toISOString();
      pairFirstRound(entries).forEach((pair, slotIndex) => {
        const bye = !pair.a || !pair.b;
        const a = pair.a ?? { id: BYE_ID, name: BYE_NAME };
        const b = pair.b ?? { id: BYE_ID, name: BYE_NAME };
        const winner = bye ? pair.a ?? pair.b : null;
        insertHistorySlot({
          tournamentId, roundId: roundIds[0], slotIndex, a, b,
          winnerId: winner?.id ?? null, result: bye ? { bye: true } : null, playedAt: startedAt,
        });
        if (winner) promoteWinner({ tournamentId, roundIds, totalRounds, roundNo: 1, slotIndex, winner });
      });

      refreshRoundStatuses({ tournamentId, totalRounds, entryCount: entries.length });
      // Chưa có lịch khởi tranh thì ghi nhận giờ khai mạc ngay lúc mở giải.
      db.prepare('UPDATE tournaments SET starts_at = COALESCE(starts_at, ?) WHERE id = ?').run(startedAt, tournamentId);
      if (tournament.status === 'open') db.prepare("UPDATE tournaments SET status = 'in_progress' WHERE id = ?").run(tournamentId);
      return getTournament(tournamentId);
    });
  }

  function attachSlotResult(tournamentId, { roundNo, slotIndex, matchId }) {
    matchId = requireText(matchId, 'matchId');
    if (!Number.isSafeInteger(roundNo) || roundNo < 1) throw new StorageError('INVALID_INPUT', 'roundNo must be a positive integer');
    if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) throw new StorageError('INVALID_INPUT', 'slotIndex must not be negative');
    return transaction(() => {
      const tournament = db.prepare('SELECT id, status FROM tournaments WHERE id = ?').get(tournamentId);
      if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
      if (tournament.status !== 'in_progress') {
        throw new StorageError('TOURNAMENT_NOT_RUNNING', 'Chỉ gắn được kết quả khi giải đang diễn ra', 409);
      }
      const match = getMatch(matchId);
      if (match.status !== 'finished') throw new StorageError('MATCH_NOT_FINISHED', 'Trận đấu chưa kết thúc nên chưa có kết quả', 409);

      const entries = listTournamentEntries(tournamentId);
      const rounds = listTournamentRounds(tournamentId);
      const bracket = buildBracket({ rounds, entryCount: entries.length });
      const slot = bracket.rounds[roundNo - 1]?.[slotIndex];
      if (!slot) throw new StorageError('SLOT_NOT_FOUND', 'Không tìm thấy trận này trong nhánh đấu', 404);
      if (slot.status === 'bye') throw new StorageError('SLOT_IS_BYE', 'Trận này là bye, không cần kết quả', 409);
      if (!slot.participantAId || !slot.participantBId) {
        throw new StorageError('SLOT_NOT_READY', 'Chưa xác định đủ hai đấu thủ cho trận này', 409);
      }
      const players = [match.team_a_id, match.team_b_id];
      if (!players.includes(slot.participantAId) || !players.includes(slot.participantBId)) {
        throw new StorageError('MATCH_MISMATCH', 'Trận đấu không diễn ra giữa hai đấu thủ của nhánh này', 409);
      }

      const round = rounds.find(item => Number(item.round_no) === Number(roundNo));
      if (!round) throw new StorageError('ROUND_NOT_FOUND', 'Tournament round not found', 404);
      const winnerId = match.winner_id ?? null;
      const result = { draw: winnerId === null, reason: match.reason ?? null, source_match_id: match.id };
      const playedAt = match.ended_at ?? new Date().toISOString();
      const existing = db.prepare('SELECT id FROM tournament_match_history WHERE round_id = ? AND slot_index = ?').get(round.id, slotIndex);
      if (existing) {
        db.prepare(`UPDATE tournament_match_history SET match_id = ?, participant_a_id = ?, participant_a_name = ?,
          participant_b_id = ?, participant_b_name = ?, winner_id = ?, result_json = ?, played_at = ? WHERE id = ?`)
          .run(matchId, slot.participantAId, slot.participantAName, slot.participantBId, slot.participantBName,
            winnerId, JSON.stringify(result), timestamp(playedAt), existing.id);
      } else {
        insertHistorySlot({
          tournamentId, roundId: round.id, slotIndex, matchId, playedAt, winnerId, result,
          a: { id: slot.participantAId, name: slot.participantAName },
          b: { id: slot.participantBId, name: slot.participantBName },
        });
      }

      const roundIds = rounds.map(item => item.id);
      if (winnerId) {
        promoteWinner({
          tournamentId, roundIds, totalRounds: bracket.totalRounds, roundNo, slotIndex,
          winner: {
            id: winnerId,
            name: winnerId === slot.participantAId ? slot.participantAName : slot.participantBName,
          },
        });
      }
      refreshRoundStatuses({ tournamentId, totalRounds: bracket.totalRounds, entryCount: entries.length });
      // Mở cửa sổ nộp code (10p mặc định) cho vòng kế tiếp khi vòng này đã xong.
      const roundRow = db.prepare('SELECT status FROM tournament_rounds WHERE id = ?').get(round.id);
      if (roundRow?.status === 'completed' && roundNo < bracket.totalRounds) {
        const next = rounds.find((item) => Number(item.round_no) === roundNo + 1);
        if (next) {
          const tournamentCfg = JSON.parse(db.prepare('SELECT config_json FROM tournaments WHERE id = ?').get(tournamentId).config_json ?? '{}');
          const windowMinutes = Number(tournamentCfg.submissionWindowMinutes) || 10;
          db.prepare("UPDATE tournament_rounds SET status = 'in_progress', submission_started_at = ?, submission_deadline = ? WHERE id = ?")
            .run(new Date().toISOString(), new Date(Date.now() + windowMinutes * 60 * 1000).toISOString(), next.id);
        }
      }
      if (winnerId && roundNo === bracket.totalRounds) {
        db.prepare("UPDATE tournaments SET status = 'completed', champion_id = ? WHERE id = ?").run(winnerId, tournamentId);
      }
      return getTournament(tournamentId);
    });
  }

  // ── Đọc 1 bot submission theo id (không cần biết room/team) ──
  function getBotSubmissionById(id) {
    if (!id) return null;
    const row = db.prepare(`SELECT id, room_id, team_id, filename, source, source_sha256, created_at
      FROM bot_submissions WHERE id = ?`).get(id);
    if (!row) throw new StorageError('SUBMISSION_NOT_FOUND', 'Bot submission not found', 404);
    return row;
  }

  // ── Tập participant-id của user (userId hoặc team mà user là thành viên) ──
  function myEntryIdSet(entries, userId) {
    const ids = new Set();
    for (const entry of entries) {
      if (entry.user_id && String(entry.user_id) === String(userId)) ids.add(entry.user_id);
      if (entry.team_id) {
        const member = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(entry.team_id, userId);
        if (member) ids.add(entry.team_id);
      }
    }
    return ids;
  }

  function submissionOf(tournamentId, config, entryId, roundNo) {
    let submissionId = null;
    if (config.roundSubmissionMode === 'PER_ROUND') {
      const row = db.prepare(`SELECT submission_id FROM tournament_round_submissions
        WHERE tournament_id = ? AND round_no = ? AND entry_id = ?`).get(tournamentId, roundNo, entryId);
      submissionId = row?.submission_id ?? null;
    } else {
      const entry = db.prepare(`SELECT bot_submission_id FROM tournament_entries
        WHERE tournament_id = ? AND (team_id = ? OR (user_id = ? AND team_id IS NULL))`)
        .get(tournamentId, entryId, entryId);
      submissionId = entry?.bot_submission_id ?? null;
    }
    if (!submissionId) return null;
    const row = getBotSubmissionById(submissionId);
    return { id: row.id, filename: row.filename };
  }

  // Trận hiện tại của user ở vòng đang diễn ra (slot ready, chưa có winner/matchId).
  function getTournamentMyMatch(tournamentId, userId) {
    userId = requireText(userId, 'userId');
    const tournament = db.prepare('SELECT id, format, status, config_json FROM tournaments WHERE id = ? OR code = ?').get(tournamentId, tournamentId);
    if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    const config = JSON.parse(tournament.config_json);
    const entries = listTournamentEntries(tournament.id);
    const myIds = myEntryIdSet(entries, userId);
    const rounds = listTournamentRounds(tournament.id);

    for (const round of rounds) {
      // Vòng chưa mở cửa sổ nộp code thì chưa tính là trận hiện tại.
      if (!round.submission_started_at) continue;
      for (const slot of round.matches) {
        if (slot.winner_id || slot.match_id || !slot.participant_a_id || !slot.participant_b_id) continue;
        const meIsA = myIds.has(slot.participant_a_id);
        const meIsB = myIds.has(slot.participant_b_id);
        if (!meIsA && !meIsB) continue;
        const me = meIsA ? slot.participant_a_id : slot.participant_b_id;
        const opp = meIsA ? slot.participant_b_id : slot.participant_a_id;
        const readinessRows = db.prepare(`SELECT participant_id, ready FROM tournament_readiness
          WHERE tournament_id = ? AND round_no = ? AND slot_index = ?`)
          .all(tournament.id, round.round_no, slot.slot_index);
        const ready = new Map(readinessRows.map((row) => [row.participant_id, Boolean(row.ready)]));
        const meSub = submissionOf(tournament.id, config, me, round.round_no);
        const oppSub = submissionOf(tournament.id, config, opp, round.round_no);
        const meReady = Boolean(ready.get(me));
        const oppReady = Boolean(ready.get(opp));
        return {
          found: true,
          tournamentId: tournament.id,
          tournamentStatus: tournament.status,
          roundNo: round.round_no,
          slotIndex: slot.slot_index,
          matchKey: `r${round.round_no}m${slot.slot_index}`,
          mode: config.roundSubmissionMode ?? 'SINGLE',
          submissionWindowMinutes: config.submissionWindowMinutes ?? 10,
          submissionStartedAt: round.submission_started_at ?? null,
          submissionDeadline: round.submission_deadline ?? null,
          me: {
            entryId: me,
            name: meIsA ? slot.participant_a_name : slot.participant_b_name,
            ready: meReady,
            submitted: Boolean(meSub),
            submissionId: meSub?.id ?? null,
            filename: meSub?.filename ?? null,
          },
          opponent: {
            entryId: opp,
            name: meIsA ? slot.participant_b_name : slot.participant_a_name,
            ready: oppReady,
            submitted: Boolean(oppSub),
            submissionId: oppSub?.id ?? null,
            filename: oppSub?.filename ?? null,
          },
          bothReady: meReady && oppReady,
          matchId: slot.match_id ?? null,
        };
      }
    }
    return { found: false, tournamentId: tournament.id, tournamentStatus: tournament.status };
  }

  // Bấm Sẵn sàng / Hủy sẵn sàng cho slot hiện tại của user.
  function setTournamentReady(tournamentId, userId, { ready = true } = {}) {
    const current = getTournamentMyMatch(tournamentId, userId);
    const found = current.found;
    if (!found) throw new StorageError('NO_ACTIVE_MATCH', 'Bạn chưa có trận đấu nào chờ sẵn sàng trong vòng hiện tại.', 409);
    const config = JSON.parse(db.prepare('SELECT config_json FROM tournaments WHERE id = ?').get(current.tournamentId).config_json);
    if (ready && current.mode === 'PER_ROUND' && !current.me.submitted) {
      throw new StorageError('SUBMISSION_REQUIRED', 'Hãy nộp code cho vòng này trước khi bấm Sẵn sàng.');
    }
    if (ready && current.mode !== 'PER_ROUND' && !current.me.submissionId) {
      throw new StorageError('SUBMISSION_REQUIRED', 'Bạn chưa đăng ký bot cho giải này.');
    }
    db.prepare(`INSERT INTO tournament_readiness (tournament_id, round_no, slot_index, participant_id, ready, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tournament_id, round_no, slot_index, participant_id)
      DO UPDATE SET ready = excluded.ready, updated_at = excluded.updated_at`)
      .run(current.tournamentId, current.roundNo, current.slotIndex, current.me.entryId, Number(Boolean(ready)), new Date().toISOString());
    const refreshed = getTournamentMyMatch(current.tournamentId, userId);
    refreshed.ready = Boolean(ready);
    refreshed.bothReady = refreshed.me.ready && refreshed.opponent.ready;
    refreshed.matchStarting = refreshed.bothReady;
    return refreshed;
  }

  // Nộp bot theo vòng (PER_ROUND). SUBMISSION_REQUIRED nếu mode không cho phép.
  function submitTournamentRoundBot(tournamentId, userId, roundNo, { filename, source } = {}) {
    const tournament = db.prepare('SELECT id, status, config_json FROM tournaments WHERE id = ? OR code = ?').get(tournamentId, tournamentId);
    if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    const config = JSON.parse(tournament.config_json);
    if (config.roundSubmissionMode !== 'PER_ROUND') {
      throw new StorageError('INVALID_MODE', 'Giải không ở chế độ nộp bot theo vòng (PER_ROUND).');
    }
    if (tournament.status !== 'in_progress') {
      throw new StorageError('INVALID_STATE', 'Giải chưa bắt đầu hoặc đã kết thúc.');
    }
    if (!Number.isSafeInteger(roundNo) || roundNo < 1) throw new StorageError('INVALID_INPUT', 'roundNo phải là số nguyên > 0');
    const entries = listTournamentEntries(tournament.id);
    const myIds = myEntryIdSet(entries, userId);
    const round = db.prepare('SELECT round_no FROM tournament_rounds WHERE tournament_id = ? AND round_no = ?').get(tournament.id, roundNo);
    if (!round) throw new StorageError('ROUND_NOT_FOUND', 'Không tìm thấy vòng đấu này.');

    const entry = entries.find((entry) => myIds.has(entry.team_id ?? entry.user_id));
    if (!entry) throw new StorageError('NOT_ENTRY', 'Bạn chưa đăng ký giải này.');
    const entryId = entry.team_id ?? entry.user_id;
    const roomId = `t-${tournament.id}-r${roundNo}`;
    registerTeam({ id: entryId, name: entry.display_name ?? entryId });
    const saved = saveBotSubmission({ roomId, teamId: entryId, filename: filename ?? 'bot.py', source });
    db.prepare(`INSERT INTO tournament_round_submissions (tournament_id, round_no, entry_id, submission_id, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tournament_id, round_no, entry_id)
      DO UPDATE SET submission_id = excluded.submission_id, created_at = excluded.created_at`)
      .run(tournament.id, roundNo, entryId, saved.id, new Date().toISOString());
    return { id: saved.id, filename: saved.filename, roundNo };
  }

  // Slot tổng quát theo (tournamentId, roundNo, slotIndex) — dùng cho phòng đấu.
  function getTournamentSlot(tournamentId, roundNo, slotIndex) {
    const tournament = db.prepare('SELECT id, status, config_json FROM tournaments WHERE id = ? OR code = ?').get(tournamentId, tournamentId);
    if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    if (!Number.isSafeInteger(roundNo) || roundNo < 1 || !Number.isSafeInteger(slotIndex) || slotIndex < 0) {
      throw new StorageError('INVALID_INPUT', 'roundNo/slotIndex không hợp lệ');
    }
    const round = db.prepare('SELECT id, round_no, status FROM tournament_rounds WHERE tournament_id = ? AND round_no = ?').get(tournament.id, roundNo);
    if (!round) throw new StorageError('ROUND_NOT_FOUND', 'Không tìm thấy vòng đấu này.', 404);
    const row = db.prepare(`SELECT id, match_id, participant_a_id, participant_a_name, participant_b_id, participant_b_name,
      winner_id FROM tournament_match_history WHERE round_id = ? AND slot_index = ?`).get(round.id, slotIndex);
    return {
      tournamentId: tournament.id,
      tournamentStatus: tournament.status,
      config: JSON.parse(tournament.config_json),
      roundNo,
      slotIndex,
      slotId: row?.id ?? null,
      matchId: row?.match_id ?? null,
      participantAId: row?.participant_a_id ?? null,
      participantAName: row?.participant_a_name ?? null,
      participantBId: row?.participant_b_id ?? null,
      participantBName: row?.participant_b_name ?? null,
      winnerId: row?.winner_id ?? null,
    };
  }

  // Xử lý hết giờ nộp code vòng: ai chưa nộp → xử thua; cả 2 chưa nộp → chọn ngẫu nhiên.
  function resolveRoundSubmissionDeadline(tournamentId, roundNo) {
    roundNo = Number(roundNo);
    if (!Number.isSafeInteger(roundNo) || roundNo < 1) throw new StorageError('INVALID_INPUT', 'roundNo phải là số nguyên > 0');
    return transaction(() => {
      const tournament = db.prepare('SELECT id, status, format, config_json FROM tournaments WHERE id = ? OR code = ?').get(tournamentId, tournamentId);
      if (!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
      if (tournament.format !== 'single_elimination') {
        throw new StorageError('FORMAT_NOT_SUPPORTED', 'Chỉ hỗ trợ xử lý hết giờ cho thể thức loại trực tiếp.');
      }
      const config = JSON.parse(tournament.config_json ?? '{}');
      const entries = listTournamentEntries(tournament.id);
      const rounds = listTournamentRounds(tournament.id);
      const round = rounds.find((item) => Number(item.round_no) === roundNo);
      if (!round) throw new StorageError('ROUND_NOT_FOUND', 'Không tìm thấy vòng đấu này.', 404);

      const results = [];
      const roundIds = rounds.map((item) => item.id);
      const bracket = buildBracket({ rounds, entryCount: entries.length });
      const totalRounds = bracket.totalRounds;

      for (const slot of round.matches) {
        if (slot.winner_id || slot.match_id || !slot.participant_a_id || !slot.participant_b_id) continue;
        if (slot.participant_a_id === BYE_ID || slot.participant_b_id === BYE_ID) continue;
        const aSub = submissionOf(tournament.id, config, slot.participant_a_id, roundNo);
        const bSub = submissionOf(tournament.id, config, slot.participant_b_id, roundNo);
        let winnerId = null;
        let reason = null;
        if (aSub && !bSub) {
          winnerId = slot.participant_a_id;
          reason = 'FORFEIT';
        } else if (!aSub && bSub) {
          winnerId = slot.participant_b_id;
          reason = 'FORFEIT';
        } else if (!aSub && !bSub) {
          // Cả 2 chưa nộp: chọn ngẫu nhiên 1 người thắng.
          winnerId = Math.random() < 0.5 ? slot.participant_a_id : slot.participant_b_id;
          reason = 'RANDOM';
        } else {
          continue; // cả 2 đã nộp: để phòng đấu xử lý.
        }
        const winnerName = winnerId === slot.participant_a_id ? slot.participant_a_name : slot.participant_b_name;
        const winner = { id: winnerId, name: winnerName };
        const result = { reason, source_match_id: null, forfeit: true };
        const playedAt = new Date().toISOString();
        const history = db.prepare(`SELECT id FROM tournament_match_history WHERE round_id = ? AND slot_index = ?`).get(round.id, slot.slot_index);
        if (history) {
          db.prepare(`UPDATE tournament_match_history SET winner_id = ?, result_json = ?, played_at = ? WHERE id = ?`)
            .run(winnerId, JSON.stringify(result), playedAt, history.id);
        }
        promoteWinner({ tournamentId: tournament.id, roundIds, totalRounds, roundNo, slotIndex: slot.slot_index, winner });
        refreshRoundStatuses({ tournamentId: tournament.id, totalRounds, entryCount: entries.length });
        results.push({ roundNo, slotIndex: slot.slot_index, winnerId, reason });
      }
      // Vòng tiếp theo nhận người thắng → mở cửa sổ nộp code mới.
      const winnerIds = db.prepare(`SELECT DISTINCT winner_id FROM tournament_match_history
        WHERE round_id = ? AND winner_id IS NOT NULL`).all(round.id).map((row) => row.winner_id);
      const allSettled = winnerIds.length === bracket.rounds[roundNo - 1].length;
      db.prepare('UPDATE tournament_rounds SET status = ? WHERE id = ?').run(allSettled ? 'completed' : 'in_progress', round.id);
      if (allSettled && roundNo < totalRounds) {
        const next = rounds.find((item) => Number(item.round_no) === roundNo + 1);
        // Vòng kế chỉ tự mở khi chủ giải đã đặt giờ và giờ đó tới hạn; chưa đặt thì chờ bấm mở.
        const due = Number(next?.auto_start) === 1
          && (!next?.scheduled_at || Date.parse(next.scheduled_at) <= Date.now());
        if (next && due) {
          const windowMinutes = Number(config.submissionWindowMinutes) || 10;
          const startedAt = new Date().toISOString();
          const deadline = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
          db.prepare('UPDATE tournament_rounds SET status = ?, submission_started_at = ?, submission_deadline = ? WHERE id = ?')
            .run('in_progress', startedAt, deadline, next.id);
        }
      }
      if (roundNo === totalRounds && results.some((r) => r.winnerId)) {
        db.prepare("UPDATE tournaments SET status = 'completed', champion_id = ? WHERE id = ?").run(results[0]?.winnerId ?? null, tournament.id);
      }
      return { tournamentId: tournament.id, roundNo, results, resolved: results.length };
    });
  }

  // Gợi ý nick: tìm gần đúng, không phân biệt hoa thường hay dấu.
  function searchUsers(q, limit = 10) {
    const term = normalizeSearchText(q);
    if (!term) return { items: [] };
    const rows = db.prepare(
      'SELECT id, display_name, avatar_url, guest FROM users ORDER BY display_name'
    ).all();
    return { items: rows.filter((row) => searchTermMatches(row.display_name, term)).slice(0, limit) };
  }

  function getUserPublicProfile(id) {
    const user = db.prepare('SELECT id, display_name, avatar_url, role, created_at FROM users WHERE id = ?').get(id);
    if (!user) throw new StorageError('USER_NOT_FOUND', 'User not found', 404);
    const stats = db.prepare(`SELECT COUNT(*) AS played,
      SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) AS draws
      FROM matches WHERE status = 'finished' AND (team_a_id = ? OR team_b_id = ?)`).get(id, id, id);
    const rows = db.prepare(`SELECT t.id, t.code, t.name, t.status, t.starts_at
      FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.user_id = ?
      UNION
      SELECT t.id, t.code, t.name, t.status, t.starts_at
      FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
      JOIN team_members tm ON tm.team_id = e.team_id AND tm.user_id = ?`).all(id, id);
    const tournaments = rows.sort((a, b) => {
      if (a.starts_at === null && b.starts_at === null) return 0;
      if (a.starts_at === null) return -1;
      if (b.starts_at === null) return 1;
      return String(b.starts_at).localeCompare(String(a.starts_at));
    });
    const played = Number(stats.played ?? 0), wins = Number(stats.wins ?? 0), draws = Number(stats.draws ?? 0);
    return { ...user, stats: { played, wins, draws, losses: played - wins - draws }, tournaments };
  }

  function saveBotSubmission({ id = randomUUID(), roomId, teamId, filename, source }) {
    roomId = requireText(roomId, 'roomId'); teamId = requireText(teamId, 'teamId');
    filename = requireText(filename, 'filename'); source = requireText(source, 'source');
    const createdAt = new Date().toISOString();
    const sourceSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
    db.prepare('INSERT INTO bot_submissions (id, room_id, team_id, filename, source, source_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, roomId, teamId, filename, source, sourceSha256, createdAt);
    return { id, room_id: roomId, team_id: teamId, filename, source_sha256: sourceSha256, created_at: createdAt };
  }

  function listBotSubmissions({ roomId, teamId, limit, offset } = {}) {
    limit = pageValue(limit, 20, 100); offset = pageValue(offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === 0) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    const clauses = [], args = [];
    if (roomId !== undefined) { clauses.push('room_id = ?'); args.push(roomId); }
    if (teamId !== undefined) { clauses.push('team_id = ?'); args.push(teamId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM bot_submissions ${where}`).get(...args).total;
    const items = db.prepare(`SELECT id, room_id, team_id, filename, source_sha256, created_at
      FROM bot_submissions ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { items, total, limit, offset };
  }

  function getBotSubmission(id, roomId, teamId) {
    const row = db.prepare(`SELECT id, room_id, team_id, filename, source, source_sha256, created_at
      FROM bot_submissions WHERE id = ? AND room_id = ? AND team_id = ?`).get(id, roomId, teamId);
    if (!row) throw new StorageError('SUBMISSION_NOT_FOUND', 'Bot submission not found', 404);
    return row;
  }

  function abortInterruptedMatches() {
    return db.prepare(`UPDATE matches SET status = 'aborted', reason = 'SERVER_RESTART',
      ended_at = ? WHERE status = 'playing'`).run(new Date().toISOString()).changes;
  }

  return { registerTeam, addTeamMember, getTeamMembers, getTeam,
    startMatch, appendTurn, finishMatch, getMatch, listMatches,
    getReplay, getRankings, listGames, upsertUser, getAuthUser, findAuthUser, createAuthUser, updateAuthPassword,
    getAuthIdentity, addAuthIdentity, listAuthIdentities, saveAuthSession, getAuthSession, deleteAuthSession, listTournaments, getTournament, createTournament,
    createTournamentRound, addTournamentEntry, setEntrySubmission, recordTournamentMatch, updateTournamentStatus, saveBotSubmission,
    generateTournamentBracket, attachSlotResult, getUserPublicProfile, searchUsers,
    listTournamentNotifications, markTournamentNotificationRead,
    updateTournamentSchedule, updateTournamentRegistrationWindow, updateRoundSchedule, triggerRoundStart, rescheduleMatch, listAutoStartDue, listRoundsDueToStart,
    listBotSubmissions, getBotSubmission, getBotSubmissionById, importReplay, abortInterruptedMatches,
    getTournamentMyMatch, setTournamentReady, submitTournamentRoundBot,
    getTournamentSlot, resolveRoundSubmissionDeadline, close: () => db.close() };
}
