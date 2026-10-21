import { randomUUID } from 'node:crypto';

import {
  calculateEloPair,
  DEFAULT_ELO_CONFIG,
} from '../../domain/rating/Elo.js';

export class RatingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RatingError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function createRatingService({
  repository,
  config = DEFAULT_ELO_CONFIG,
  clock = () => new Date(),
  ids = { next: () => randomUUID() },
  events = null,
} = {}) {
  if (!repository) throw new Error('RatingService cần repository.');

  async function getRating(gameId, userId) {
    return repository.get(gameId, userId);
  }

  async function applyMatchResult({
    matchId,
    gameId,
    participants,
    outcome,
    reason = null,
  }) {
    assertMatchInput({ matchId, gameId, participants, outcome });

    const result = await repository.transaction(async (tx) => {
      // claimMatch là idempotency guard: engine retry không cộng Elo hai lần.
      const claimed = await tx.claimMatch({ matchId, gameId });
      if (!claimed) {
        return { applied: false, matchId, gameId, reason: 'ALREADY_APPLIED' };
      }

      const a = await tx.getForUpdate(gameId, participants.a.userId);
      const b = await tx.getForUpdate(gameId, participants.b.userId);
      const elo = calculateEloPair({ playerA: a, playerB: b, outcome, config });

      const now = clock().toISOString();
      const outcomeFor = (side) => {
        if (outcome === 'draw') return 'draw';
        return outcome === side ? 'win' : 'loss';
      };

      const rows = [
        updateRow(a, elo.a, outcomeFor('a'), now),
        updateRow(b, elo.b, outcomeFor('b'), now),
      ];
      await tx.save(rows);

      for (const side of ['a', 'b']) {
        const change = elo[side];
        await tx.appendHistory({
          id: ids.next(),
          matchId,
          gameId,
          userId: participants[side].userId,
          before: change.before,
          after: change.after,
          delta: change.change,
          outcome: outcomeFor(side),
          reason,
          createdAt: now,
        });
      }

      return {
        applied: true,
        matchId,
        gameId,
        a: { ...elo.a, userId: a.userId },
        b: { ...elo.b, userId: b.userId },
      };
    });

    if (result.applied) events?.publish?.('RATING_UPDATED', result);
    return result;
  }

  function leaderboard(query) {
    return repository.leaderboard(query);
  }

  function history(query) {
    return repository.history(query);
  }

  return { getRating, applyMatchResult, leaderboard, history };
}

function assertMatchInput({ matchId, gameId, participants, outcome }) {
  if (typeof matchId !== 'string' || !matchId) {
    throw new RatingError('INVALID_MATCH_ID', 'matchId không hợp lệ.');
  }
  if (typeof gameId !== 'string' || !gameId) {
    throw new RatingError('INVALID_GAME_ID', 'gameId không hợp lệ.');
  }
  if (!participants?.a?.userId || !participants?.b?.userId) {
    throw new RatingError('INVALID_PARTICIPANTS', 'Thiếu participant userId.');
  }
  if (participants.a.userId === participants.b.userId) {
    throw new RatingError('DUPLICATE_PARTICIPANT', 'Hai participant trùng userId.');
  }
  if (!['a', 'b', 'draw'].includes(outcome)) {
    throw new RatingError('INVALID_OUTCOME', `outcome không hợp lệ: ${outcome}`);
  }
}

function updateRow(row, change, outcome, now) {
  return {
    ...row,
    rating: change.after,
    gamesPlayed: row.gamesPlayed + 1,
    wins: row.wins + (outcome === 'win' ? 1 : 0),
    losses: row.losses + (outcome === 'loss' ? 1 : 0),
    draws: row.draws + (outcome === 'draw' ? 1 : 0),
    updatedAt: now,
  };
}
