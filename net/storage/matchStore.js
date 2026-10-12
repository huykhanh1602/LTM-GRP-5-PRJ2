import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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

export function createMatchStore({ filename = process.env.DB_PATH || resolve('data/game.sqlite') } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = work();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function registerTeam({ id, name = id }) {
    id = requireText(id, 'team.id');
    name = requireText(name, 'team.name');
    db.prepare(`INSERT INTO teams VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name`).run(id, name, new Date().toISOString());
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }

  function getMatch(id) {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!row) throw new StorageError('MATCH_NOT_FOUND', 'Match not found', 404);
    const { config_json, initial_state_json, final_state_json, result_json, ...match } = row;
    return { ...match, ranked: Boolean(match.ranked), config: JSON.parse(config_json),
      initial_state: JSON.parse(initial_state_json), final_state: JSON.parse(final_state_json),
      result: result_json === null ? null : JSON.parse(result_json) };
  }

  function startMatch({ id = randomUUID(), roomId, teamA, teamB, ranked = true, config = {}, initialState = null }) {
    id = requireText(id, 'match.id');
    roomId = requireText(roomId, 'roomId');
    if (!teamA || !teamB || teamA.id === teamB.id || typeof ranked !== 'boolean') {
      throw new StorageError('INVALID_INPUT', 'Two distinct teams and a boolean ranked are required');
    }
    return transaction(() => {
      if (db.prepare('SELECT id FROM matches WHERE id = ?').get(id)) {
        throw new StorageError('MATCH_EXISTS', 'Match ID already exists', 409);
      }
      const a = registerTeam(teamA), b = registerTeam(teamB);
      db.prepare(`INSERT INTO matches
        (id, room_id, team_a_id, team_b_id, status, ranked, started_at,
         config_json, initial_state_json, final_state_json)
        VALUES (?, ?, ?, ?, 'playing', ?, ?, ?, ?, ?)`).run(
        id, roomId, a.id, b.id, Number(ranked), new Date().toISOString(),
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
  function finishMatch(id, result = null, finalState = null) {
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
        status, winner, result?.reason ?? null, new Date().toISOString(),
        JSON.stringify(result), JSON.stringify(finalState), id);
      return getMatch(id);
    });
  }

  function listMatches({ teamId, status, limit, offset } = {}) {
    limit = pageValue(limit, 20, 100);
    offset = pageValue(offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === 0) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    const clauses = [], args = [];
    if (teamId !== undefined) { clauses.push('(team_a_id = ? OR team_b_id = ?)'); args.push(teamId, teamId); }
    if (status !== undefined) {
      if (!['playing', 'finished', 'aborted'].includes(status)) throw new StorageError('INVALID_STATUS', 'Invalid status');
      clauses.push('status = ?'); args.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM matches ${where}`).get(...args).total;
    const items = db.prepare(`SELECT id, room_id, team_a_id, team_b_id, status, ranked,
      winner_id, reason, started_at, ended_at FROM matches ${where}
      ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
      .map(row => ({ ...row, ranked: Boolean(row.ranked) }));
    return { items, total, limit, offset };
  }

  function getReplay(id) {
    const match = getMatch(id);
    const teams = db.prepare('SELECT id, name FROM teams WHERE id IN (?, ?)').all(match.team_a_id, match.team_b_id);
    const names = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const turns = db.prepare('SELECT * FROM match_turns WHERE match_id = ? ORDER BY turn').all(id)
      .map(row => ({ turn: row.turn, player: row.player, actions: JSON.parse(row.actions_json),
        events: JSON.parse(row.events_json), state: JSON.parse(row.state_json) }));
    return { match_info: { match_id: id, status: match.status,
      teams: { team_a: names[match.team_a_id], team_b: names[match.team_b_id] },
      team_ids: { team_a: match.team_a_id, team_b: match.team_b_id },
      winner: match.winner_id, win_reason: match.reason },
      game_config: match.config, initial_state: match.initial_state, turns, final_state: match.final_state };
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

  function abortInterruptedMatches() {
    return db.prepare(`UPDATE matches SET status = 'aborted', reason = 'SERVER_RESTART',
      ended_at = ? WHERE status = 'playing'`).run(new Date().toISOString()).changes;
  }

  return { registerTeam, startMatch, appendTurn, finishMatch, getMatch, listMatches,
    getReplay, getRankings, abortInterruptedMatches, close: () => db.close() };
}
