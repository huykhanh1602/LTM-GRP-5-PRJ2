import test from 'node:test';
import assert from 'node:assert/strict';

import { createTournamentService } from '../../net/application/tournament/TournamentService.js';
import { createSingleEliminationFormat } from '../../net/application/tournament/formats/singleElimination.js';
import { createInMemoryTournamentRepository } from '../../net/infrastructure/persistence/memory/InMemoryTournamentRepository.js';

function makeService() {
  const jobs = [];
  const repository = createInMemoryTournamentRepository();
  let index = 0;

  const service = createTournamentService({
    tournaments: repository,
    matchQueue: {
      async enqueue(job) {
        jobs.push(job);
        return { jobId: job.jobId };
      },
    },
    formats: new Map([
      ['single_elimination', createSingleEliminationFormat()],
    ]),
    ids: { next: () => `match-${++index}` },
    clock: () => new Date('2026-10-21T00:00:00.000Z'),
  });

  return { service, repository, jobs };
}

const entries = ['u1', 'u2', 'u3', 'u4'].map((userId) => ({
  userId,
  displayName: userId,
  rating: 1000,
}));

test('start enqueue bán kết, report tự đẩy winner vào chung kết', async () => {
  const { service, jobs } = makeService();

  await service.create({
    id: 't1',
    gameId: 'rps_chess',
    code: 'T1',
    name: 'Test Cup',
    format: 'single_elimination',
    entries,
  });

  await service.open('t1');
  await service.start('t1', { seed: 'manual' });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].mode, 'tournament');
  assert.equal(jobs[0].gameId, 'rps_chess');

  await service.reportMatch('t1', {
    matchId: jobs[0].matchId,
    outcome: 'a',
  });
  await service.reportMatch('t1', {
    matchId: jobs[1].matchId,
    outcome: 'a',
  });

  assert.equal(jobs.length, 4); // 2 semi + 1 final + 1 third-place

  await service.reportMatch('t1', {
    matchId: jobs[2].matchId,
    outcome: 'a',
  });

  const view = await service.get('t1');
  assert.equal(view.status, 'completed');
  assert.equal(view.championId, 'u1');
});
