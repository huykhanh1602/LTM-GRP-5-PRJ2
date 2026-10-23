// Adapter Postgres cho TournamentRepository (domain-driven tournament system).
// Lưu toàn bộ domain object (entries, bracket, v.v.) dưới dạng JSONB
// trong cột bracket_json của bảng tournaments (xem 003_tournament_bracket.sql).

export function createPostgresTournamentRepository({
  pool,
  clock = () => new Date(),
} = {}) {
  if (!pool) throw new Error('PostgresTournamentRepository cần pool.');

  const query = (client, text, values = []) => (client ?? pool).query(text, values);

  function mapRow(row) {
    if (!row) return null;
    const tournament = row.bracket_json ?? {};
    const config = row.config ?? tournament.config ?? {};
    // Đảm bảo participant_mode mặc định
    if (!config.participantMode) config.participantMode = 'INDIVIDUAL';
    if (config.participantMode === 'INDIVIDUAL') {
      config.minTeamSize = 1;
      config.maxTeamSize = 1;
    } else {
      config.minTeamSize ??= 1;
      config.maxTeamSize ??= 5;
    }
    return {
      ...tournament,
      id: row.id,
      gameId: row.game_id,
      code: row.code,
      name: row.name,
      format: row.format,
      status: row.status,
      config,
      entries: tournament.entries ?? [],
      bracket: tournament.bracket ?? null,
      championId: row.champion_id ?? tournament.championId ?? null,
      createdAt: row.created_at?.toISOString() ?? tournament.createdAt,
      startedAt: row.started_at?.toISOString() ?? tournament.startedAt ?? null,
      endedAt: tournament.endedAt ?? null,
    };
  }

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tx = {
        async getForUpdate(id) {
          const { rows } = await query(client,
            `SELECT id, game_id, code, name, format, status, config,
                    champion_id, starts_at AS started_at, created_at,
                    bracket_json
             FROM tournaments WHERE id = $1 FOR UPDATE`, [id]);
          if (!rows[0]) throw new Error(`Tournament không tồn tại: ${id}`);
          return mapRow(rows[0]);
        },

        async save(tournament) {
          const bracketJson = JSON.stringify({
            entries: tournament.entries,
            bracket: tournament.bracket,
            championId: tournament.championId,
            createdAt: tournament.createdAt,
            startedAt: tournament.startedAt,
            endedAt: tournament.endedAt,
            config: tournament.config,
          });
          await query(client,
            `UPDATE tournaments
             SET status = $2, champion_id = $3, bracket_json = $4::jsonb,
                 starts_at = $5, config = $6::jsonb
             WHERE id = $1`,
            [tournament.id, tournament.status, tournament.championId,
             bracketJson, tournament.startedAt ?? null,
             JSON.stringify(tournament.config ?? {})]);
          return tournament;
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

  async function create(tournament) {
    const bracketJson = JSON.stringify({
      entries: tournament.entries ?? [],
      bracket: tournament.bracket ?? null,
      championId: tournament.championId ?? null,
      createdAt: tournament.createdAt,
      startedAt: tournament.startedAt ?? null,
      endedAt: tournament.endedAt ?? null,
      config: tournament.config ?? {},
    });
    try {
      await query(pool,
        `INSERT INTO tournaments(id, game_id, code, name, format, status, config, starts_at, created_at, bracket_json)
         VALUES($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)`,
        [tournament.id, tournament.gameId, tournament.code, tournament.name,
         tournament.format, tournament.status ?? 'draft',
         JSON.stringify(tournament.config ?? {}),
         tournament.startedAt ?? null,
         tournament.createdAt ?? clock().toISOString(),
         bracketJson]);
    } catch (error) {
      if (error.code === '23505') throw new Error(`Tournament đã tồn tại: ${tournament.id}`);
      throw error;
    }
    return get(tournament.id);
  }

  async function get(id) {
    const { rows } = await query(pool,
      `SELECT id, game_id, code, name, format, status, config,
              champion_id, starts_at AS started_at, created_at, bracket_json
       FROM tournaments WHERE id = $1 OR code = $1`, [id]);
    if (!rows[0]) throw new Error(`Tournament không tồn tại: ${id}`);
    return mapRow(rows[0]);
  }

  async function getForUpdate(id) {
    return transaction(async (tx) => tx.getForUpdate(id));
  }

  async function save(tournament) {
    return transaction(async (tx) => {
      await tx.save(tournament);
      return tournament;
    });
  }

  async function list({ status, limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const args = [];
    let where = '';
    if (status !== undefined) {
      if (!['draft', 'open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        throw new Error('Invalid tournament status');
      }
      args.push(status);
      where = 'WHERE status = $1';
    }
    const total = Number((await query(pool,
      `SELECT COUNT(*)::int AS total FROM tournaments ${where}`, args)).rows[0].total);
    const { rows } = await query(pool,
      `SELECT id, game_id, code, name, format, status, config,
              champion_id, starts_at AS started_at, created_at, bracket_json
       FROM tournaments ${where}
       ORDER BY created_at DESC, id
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, safeLimit, safeOffset]);
    return {
      items: rows.map(mapRow),
      total, limit: safeLimit, offset: safeOffset,
    };
  }

  async function findByMatchId(matchId) {
    // Tìm tournament có bracket chứa matchId này.
    // Dùng JSONB path query để tìm trong bracket_json->'bracket'->'rounds'.
    const { rows } = await query(pool,
      `SELECT id, bracket_json FROM tournaments
       WHERE bracket_json->'bracket'->'rounds' @> $1::jsonb
       LIMIT 1`,
      [JSON.stringify([{ matchId }])]);
    if (!rows[0]) return null;
    const tournament = mapRow(rows[0]);
    const { findSlotByMatchId } = await import('../../domain/tournament/Bracket.js');
    const slot = tournament.bracket ? findSlotByMatchId(tournament.bracket, matchId) : null;
    if (!slot) return null;
    return { tournamentId: tournament.id, matchKey: slot.matchKey, slot };
  }

  return { transaction, create, get, getForUpdate, save, list, findByMatchId };
}