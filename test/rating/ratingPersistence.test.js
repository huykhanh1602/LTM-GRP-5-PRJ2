import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRatingService } from '../../net/application/rating/RatingService.js';
import { createSqliteRatingRepository } from '../../net/infrastructure/persistence/sqlite/SqliteRatingRepository.js';

test('Elo and rating history survive repository restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ltm-rating-persistence-'));
  const filename = join(directory, 'ratings.sqlite');
  const repositories = [];
  t.after(async () => {
    for (const repository of repositories) repository.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const firstRepository = createSqliteRatingRepository({ filename });
  repositories.push(firstRepository);
  const firstService = createRatingService({ repository: firstRepository });
  await firstService.applyMatchResult({
    matchId: 'persistent-ranked-match',
    gameId: 'rps_chess',
    participants: { a: { userId: 'persistent-a' }, b: { userId: 'persistent-b' } },
    outcome: 'a',
  });
  firstRepository.close();
  repositories.pop();

  const secondRepository = createSqliteRatingRepository({ filename });
  repositories.push(secondRepository);
  const secondService = createRatingService({ repository: secondRepository });
  assert.equal((await secondService.getRating('rps_chess', 'persistent-a')).rating, 1020);
  assert.equal((await secondService.getRating('rps_chess', 'persistent-b')).rating, 980);
  assert.equal((await secondService.history({ gameId: 'rps_chess', userId: 'persistent-a' })).total, 1);
});

test('concurrent ranked results are serialized without losing a rating update', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ltm-rating-concurrency-'));
  const repository = createSqliteRatingRepository({ filename: join(directory, 'ratings.sqlite') });
  t.after(async () => {
    repository.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const service = createRatingService({ repository });

  await Promise.all(Array.from({ length: 8 }, (_, index) => service.applyMatchResult({
    matchId: `concurrent-ranked-match-${index}`,
    gameId: 'rps_chess',
    participants: { a: { userId: 'same-player-a' }, b: { userId: `opponent-${index}` } },
    outcome: 'a',
  })));

  const player = await service.getRating('rps_chess', 'same-player-a');
  const history = await service.history({ gameId: 'rps_chess', userId: 'same-player-a' });
  assert.equal(player.gamesPlayed, 8);
  assert.equal(player.wins, 8);
  assert.equal(history.total, 8);
});
