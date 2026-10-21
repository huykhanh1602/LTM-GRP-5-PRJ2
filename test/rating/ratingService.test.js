import test from 'node:test';
import assert from 'node:assert/strict';

import { createRatingService } from '../../net/application/rating/RatingService.js';
import { createSqliteRatingRepository } from '../../net/infrastructure/persistence/sqlite/SqliteRatingRepository.js';

function setup() {
  const repository = createSqliteRatingRepository({ filename: ':memory:' });
  const service = createRatingService({
    repository,
    ids: (() => {
      let index = 0;
      return { next: () => `history-${++index}` };
    })(),
    clock: () => new Date('2026-10-21T00:00:00.000Z'),
  });
  return { repository, service };
}

test('áp dụng Elo, lưu rating và idempotent theo matchId', async (t) => {
  const { repository, service } = setup();
  t.after(() => repository.close());

  const input = {
    matchId: 'match-1',
    gameId: 'rps_chess',
    participants: { a: { userId: 'u1' }, b: { userId: 'u2' } },
    outcome: 'a',
  };

  const first = await service.applyMatchResult(input);
  assert.equal(first.applied, true);
  assert.equal(first.a.change, 20); // K tạm thời = 40 cho người mới
  assert.equal(first.b.change, -20);

  const a = await service.getRating('rps_chess', 'u1');
  const b = await service.getRating('rps_chess', 'u2');
  assert.equal(a.rating, 1020);
  assert.equal(b.rating, 980);

  const second = await service.applyMatchResult(input);
  assert.equal(second.applied, false);
  assert.equal((await service.getRating('rps_chess', 'u1')).rating, 1020);
});

test('leaderboard và history tách theo game', async (t) => {
  const { repository, service } = setup();
  t.after(() => repository.close());

  await service.applyMatchResult({
    matchId: 'match-1',
    gameId: 'rps_chess',
    participants: { a: { userId: 'u1' }, b: { userId: 'u2' } },
    outcome: 'a',
  });

  const leaderboard = await service.leaderboard({ gameId: 'rps_chess' });
  assert.equal(leaderboard.items.length, 2);
  assert.equal(leaderboard.items[0].userId, 'u1');
  assert.equal(leaderboard.items[0].rank, 1);

  const history = await service.history({ gameId: 'rps_chess', userId: 'u1' });
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].outcome, 'win');
  assert.equal(history.items[0].delta, 20);
});
