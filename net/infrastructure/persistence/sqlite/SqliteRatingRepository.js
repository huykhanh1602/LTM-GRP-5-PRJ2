import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS ratings (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (game_id, user_id)
);
CREATE TABLE IF NOT EXISTS rating_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating_before REAL NOT NULL,
  rating_after REAL NOT NULL,
  delta REAL NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('win','loss','draw')),
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (match_id, user_id)
);
CREATE TABLE IF NOT EXISTS rating_applied_matches (
  match_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function createSqliteRatingRepository({
  filename = process.env.RATING_DB_PATH ?? 'data/ratings.sqlite',
  db = null,
  initialRating = 1000,
  clock = () => new Date(),
} = {}) {
  const ownsDb = !db;
  if (ownsDb && filename !== ':memory:') {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const database = db ?? new DatabaseSync(filename);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  database.exec(DDL);
  let transactionQueue = Promise.resolve();

  function selectRow(gameId, userId) {
    const row = database.prepare(`
      SELECT game_id, user_id, rating, games_played, wins, losses, draws, updated_at
      FROM ratings WHERE game_id = ? AND user_id = ?
    `).get(gameId, userId);
    return row ? mapRow(row) : defaultRow(gameId, userId);
  }

  function ensureRow(gameId, userId) {
    database.prepare(`
      INSERT INTO ratings (game_id, user_id, rating)
      VALUES (?, ?, ?)
      ON CONFLICT (game_id, user_id) DO NOTHING
    `).run(gameId, userId, initialRating);
    return selectRow(gameId, userId);
  }

  function defaultRow(gameId, userId) {
    return {
      gameId,
      userId,
      rating: initialRating,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      updatedAt: null,
    };
  }

  function transaction(work) {
    const current = transactionQueue.then(async () => {
      database.exec('BEGIN IMMEDIATE');
      const now = clock().toISOString();

      const tx = {
        async claimMatch({ matchId, gameId }) {
          const result = database.prepare(`
            INSERT INTO rating_applied_matches (match_id, game_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT (match_id) DO NOTHING
          `).run(matchId, gameId, now);
          return result.changes > 0;
        },

        async getForUpdate(gameId, userId) {
          return ensureRow(gameId, userId);
        },

        async save(rows) {
          const statement = database.prepare(`
            UPDATE ratings
            SET rating = ?, games_played = ?, wins = ?, losses = ?, draws = ?, updated_at = ?
            WHERE game_id = ? AND user_id = ?
          `);
          for (const row of rows) {
            statement.run(
              row.rating,
              row.gamesPlayed,
              row.wins,
              row.losses,
              row.draws,
              row.updatedAt,
              row.gameId,
              row.userId,
            );
          }
        },

        async appendHistory(entry) {
          database.prepare(`
            INSERT INTO rating_history
              (id, match_id, game_id, user_id, rating_before, rating_after,
               delta, outcome, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            entry.id,
            entry.matchId,
            entry.gameId,
            entry.userId,
            entry.before,
            entry.after,
            entry.delta,
            entry.outcome,
            entry.reason,
            entry.createdAt,
          );
        },
      };

      try {
        const value = await work(tx);
        database.exec('COMMIT');
        return value;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    });
    // Keep the queue usable after a failed transaction while returning the
    // failure to the caller that submitted it.
    transactionQueue = current.catch(() => undefined);
    return current;
  }

  async function get(gameId, userId) {
    return selectRow(gameId, userId);
  }

  async function leaderboard({ gameId, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const total = database.prepare(
      'SELECT COUNT(*) AS total FROM ratings WHERE game_id = ?',
    ).get(gameId).total;

    const items = database.prepare(`
      SELECT user_id, rating, games_played, wins, losses, draws,
        RANK() OVER (ORDER BY rating DESC, user_id ASC) AS rank
      FROM ratings
      WHERE game_id = ?
      ORDER BY rating DESC, user_id ASC
      LIMIT ? OFFSET ?
    `).all(gameId, safeLimit, safeOffset).map((row) => ({
      userId: row.user_id,
      rating: row.rating,
      gamesPlayed: row.games_played,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      rank: row.rank,
    }));

    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  async function history({ gameId, userId, limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const total = database.prepare(`
      SELECT COUNT(*) AS total FROM rating_history WHERE game_id = ? AND user_id = ?
    `).get(gameId, userId).total;

    const items = database.prepare(`
      SELECT match_id, rating_before, rating_after, delta, outcome, reason, created_at
      FROM rating_history
      WHERE game_id = ? AND user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(gameId, userId, safeLimit, safeOffset).map((row) => ({
      matchId: row.match_id,
      before: row.rating_before,
      after: row.rating_after,
      delta: row.delta,
      outcome: row.outcome,
      reason: row.reason,
      createdAt: row.created_at,
    }));

    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  return {
    transaction,
    get,
    leaderboard,
    history,
    close: () => {
      if (ownsDb) database.close();
    },
  };
}

function mapRow(row) {
  return {
    gameId: row.game_id,
    userId: row.user_id,
    rating: row.rating,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    updatedAt: row.updated_at,
  };
}
