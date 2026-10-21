// Adapter Postgres cho RatingRepository.
// Pool được truyền từ composition root, không tự tạo kết nối toàn cục.
export function createPostgresRatingRepository({
  pool,
  initialRating = 1000,
  clock = () => new Date(),
} = {}) {
  if (!pool) throw new Error('PostgresRatingRepository cần pool.');

  const query = (client, text, values = []) => (client ?? pool).query(text, values);

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

  async function selectRow(client, gameId, userId) {
    const { rows } = await query(client, `
      SELECT game_id, user_id, rating, games_played, wins, losses, draws, updated_at
      FROM ratings WHERE game_id = $1 AND user_id = $2
    `, [gameId, userId]);
    return rows[0] ? mapRow(rows[0]) : defaultRow(gameId, userId);
  }

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tx = {
        async claimMatch({ matchId, gameId }) {
          const result = await query(client, `
            INSERT INTO rating_applied_matches (match_id, game_id, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (match_id) DO NOTHING
          `, [matchId, gameId, clock().toISOString()]);
          return result.rowCount > 0;
        },

        async getForUpdate(gameId, userId) {
          await query(client, `
            INSERT INTO ratings (game_id, user_id, rating)
            VALUES ($1, $2, $3)
            ON CONFLICT (game_id, user_id) DO NOTHING
          `, [gameId, userId, initialRating]);

          const { rows } = await query(client, `
            SELECT game_id, user_id, rating, games_played, wins, losses, draws, updated_at
            FROM ratings
            WHERE game_id = $1 AND user_id = $2
            FOR UPDATE
          `, [gameId, userId]);
          return mapRow(rows[0]);
        },

        async save(rows) {
          for (const row of rows) {
            await query(client, `
              UPDATE ratings
              SET rating = $3, games_played = $4, wins = $5,
                  losses = $6, draws = $7, updated_at = $8
              WHERE game_id = $1 AND user_id = $2
            `, [
              row.gameId,
              row.userId,
              row.rating,
              row.gamesPlayed,
              row.wins,
              row.losses,
              row.draws,
              row.updatedAt,
            ]);
          }
        },

        async appendHistory(entry) {
          await query(client, `
            INSERT INTO rating_history
              (id, match_id, game_id, user_id, rating_before, rating_after,
               delta, outcome, reason, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [
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
          ]);
        },
      };

      const value = await work(tx);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function get(gameId, userId) {
    return selectRow(pool, gameId, userId);
  }

  async function leaderboard({ gameId, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const totalResult = await query(pool,
      'SELECT COUNT(*)::int AS total FROM ratings WHERE game_id = $1', [gameId]);

    const { rows } = await query(pool, `
      SELECT user_id, rating, games_played, wins, losses, draws,
        RANK() OVER (ORDER BY rating DESC, user_id ASC) AS rank
      FROM ratings
      WHERE game_id = $1
      ORDER BY rating DESC, user_id ASC
      LIMIT $2 OFFSET $3
    `, [gameId, safeLimit, safeOffset]);

    return {
      items: rows.map((row) => ({ ...mapRow(row), rank: Number(row.rank) })),
      total: totalResult.rows[0].total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async function history({ gameId, userId, limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const totalResult = await query(pool, `
      SELECT COUNT(*)::int AS total
      FROM rating_history WHERE game_id = $1 AND user_id = $2
    `, [gameId, userId]);

    const { rows } = await query(pool, `
      SELECT match_id, rating_before, rating_after, delta, outcome, reason, created_at
      FROM rating_history
      WHERE game_id = $1 AND user_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3 OFFSET $4
    `, [gameId, userId, safeLimit, safeOffset]);

    return {
      items: rows.map((row) => ({
        matchId: row.match_id,
        before: row.rating_before,
        after: row.rating_after,
        delta: row.delta,
        outcome: row.outcome,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      total: totalResult.rows[0].total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  return { transaction, get, leaderboard, history };
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
