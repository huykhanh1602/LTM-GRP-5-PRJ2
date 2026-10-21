import test from 'node:test';
import assert from 'node:assert/strict';

import { createSingleEliminationFormat } from '../../net/application/tournament/formats/singleElimination.js';

const players = ['u1', 'u2', 'u3', 'u4'].map((userId, index) => ({
  userId,
  displayName: userId,
  rating: 1000 - index,
  seed: index + 1,
}));

test('4 người tạo 2 bán kết và 1 chung kết', () => {
  const format = createSingleEliminationFormat();
  const bracket = format.generate(players, { seed: 'manual' });

  assert.equal(bracket.rounds.length, 2);
  assert.equal(bracket.rounds[0].length, 2);
  assert.equal(bracket.rounds[1].length, 1);
});

test('winner bán kết tự điền vào chung kết và tìm ra champion', () => {
  const format = createSingleEliminationFormat();
  const bracket = format.generate(players, { seed: 'manual' });
  const [semi1, semi2] = bracket.rounds[0];

  format.bindMatch(bracket, semi1.matchKey, 'm1');
  format.bindMatch(bracket, semi2.matchKey, 'm2');

  format.applyResult(bracket, { matchId: 'm1', outcome: 'a' });
  format.applyResult(bracket, { matchId: 'm2', outcome: 'a' });

  const final = bracket.rounds[1][0];
  assert.equal(final.participantAId, 'u1');
  assert.equal(final.participantBId, 'u2');
  assert.equal(final.status, 'ready');

  format.bindMatch(bracket, final.matchKey, 'm3');
  format.applyResult(bracket, { matchId: 'm3', outcome: 'a' });

  assert.equal(format.status(bracket).championId, 'u1');
});

test('5 người có bye và tự advance', () => {
  const format = createSingleEliminationFormat();
  const five = [...players, {
    userId: 'u5',
    displayName: 'u5',
    rating: 900,
    seed: 5,
  }];

  const bracket = format.generate(five, { seed: 'rating' });
  assert.equal(bracket.rounds[0].length, 4);
  assert.ok(bracket.rounds.flat().some((slot) => slot.status === 'bye'));
});

test('single elimination từ chối draw', () => {
  const format = createSingleEliminationFormat();
  const bracket = format.generate(players, { seed: 'manual' });
  const semi = bracket.rounds[0][0];
  format.bindMatch(bracket, semi.matchKey, 'm1');

  assert.throws(
    () => format.applyResult(bracket, { matchId: 'm1', outcome: 'draw' }),
    /draw/i,
  );
});
