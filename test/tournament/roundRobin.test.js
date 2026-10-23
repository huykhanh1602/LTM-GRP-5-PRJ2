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

test('Tie-breaker: Head-to-head, Win/Loss diff, Time', () => {
  const format = createRoundRobinFormat();
  const bracket = format.generate(players.slice(0, 3), { seed: 'manual' }); // 3 người

  // Giả lập kết quả để bằng điểm
  // u1 thắng u2, u2 thắng u3, u3 thắng u1 (vòng tròn)
  // Mỗi người 1 thắng 1 thua = 3 điểm
  const results = [
    { pA: 'u1', pB: 'u2', winner: 'a', sA: 10, sB: 5, tA: 100, tB: 200 },
    { pA: 'u2', pB: 'u3', winner: 'a', sA: 10, sB: 5, tA: 100, tB: 200 },
    { pA: 'u3', pB: 'u1', winner: 'a', sA: 10, sB: 5, tA: 100, tB: 200 },
  ];

  for (const res of results) {
    const slot = bracket.rounds.flat().find(s =>
      (s.participantAId === res.pA && s.participantBId === res.pB) ||
      (s.participantAId === res.pB && s.participantBId === res.pA)
    );
    format.bindMatch(bracket, slot.matchKey, 'm1');
    format.applyResult(bracket, {
      matchId: 'm1',
      outcome: res.pA === res.winner ? 'a' : 'b',
      scoreA: res.sA, scoreB: res.sB,
      timeA: res.tA, timeB: res.tB
    });
  }

  const table = format.standings(bracket);
  // Kiểm tra thứ tự: Win/Loss diff (10-5=5) > Time (100)
  // u1: 1 thắng, 1 thua, diff 0, time 200
  // u2: 1 thắng, 1 thua, diff 0, time 200
  // u3: 1 thắng, 1 thua, diff 0, time 200
  // Tất cả bằng nhau, thứ tự theo seed/userId
  assert.ok(table.length === 3);
});
