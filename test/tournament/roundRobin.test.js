import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoundRobinFormat } from '../../net/application/tournament/formats/roundRobin.js';

const players = ['u1', 'u2', 'u3', 'u4'].map((userId, index) => ({
  userId,
  displayName: userId,
  rating: 1000 - index,
  seed: index + 1,
}));

test('4 người tạo 3 vòng, 6 trận', () => {
  const format = createRoundRobinFormat();
  const bracket = format.generate(players, { seed: 'manual' });

  assert.equal(bracket.rounds.length, 3);
  assert.equal(bracket.rounds.flat().length, 6);
});

test('cộng điểm 3/1/0 và tìm champion', () => {
  const format = createRoundRobinFormat();
  const bracket = format.generate(players, { seed: 'manual' });
  const rank = new Map(players.map((player, index) => [player.userId, index]));

  for (const slot of bracket.rounds.flat()) {
    const matchId = `m-${slot.matchKey}`;
    format.bindMatch(bracket, slot.matchKey, matchId);

    const winner = rank.get(slot.participantAId) < rank.get(slot.participantBId)
      ? 'a'
      : 'b';
    format.applyResult(bracket, { matchId, outcome: winner });
  }

  const table = format.standings(bracket);
  assert.equal(table[0].userId, 'u1');
  assert.equal(table[0].points, 9);
  assert.equal(table[1].points, 6);
  assert.equal(table[2].points, 3);

  const status = format.status(bracket);
  assert.equal(status.complete, true);
  assert.equal(status.championId, 'u1');
});

test('draw được cộng 1 điểm cho mỗi bên', () => {
  const format = createRoundRobinFormat();
  const bracket = format.generate(players.slice(0, 2), { seed: 'manual' });
  const slot = bracket.rounds[0][0];

  format.bindMatch(bracket, slot.matchKey, 'm1');
  format.applyResult(bracket, { matchId: 'm1', outcome: 'draw' });

  const table = format.standings(bracket);
  assert.equal(table[0].points, 1);
  assert.equal(table[1].points, 1);
});
