import test from 'node:test';
import assert from 'node:assert/strict';

import { createSingleEliminationFormat } from '../../net/application/tournament/formats/singleElimination.js';

const players = ['u1', 'u2', 'u3', 'u4'].map((userId, index) => ({
  userId,
  displayName: userId,
  rating: 1000 - index,
  seed: index + 1,
}));

test('Third-place match được tạo sau khi bán kết kết thúc', () => {
  const format = createSingleEliminationFormat();
  const bracket = format.generate(players, { seed: 'manual' });
  const [semi1, semi2] = bracket.rounds[0];

  format.bindMatch(bracket, semi1.matchKey, 'm1');
  format.bindMatch(bracket, semi2.matchKey, 'm2');

  // Đội A thắng cả hai bán kết; bên thua phải vào trận hạng ba.
  format.applyResult(bracket, { matchId: 'm1', outcome: 'a' }); // u1 thắng
  format.applyResult(bracket, { matchId: 'm2', outcome: 'a' }); // u3 thắng

  // Kiểm tra third-place match (round 1, index 1)
  const finalRound = bracket.rounds[1];
  assert.equal(finalRound.length, 2); // Final + Third-place
  const thirdPlace = finalRound[1];
  
  // Lấy đúng hai người thua theo cặp bán kết do hệ thống xếp hạt giống.
  const expectedLosers = [semi1.participantBId, semi2.participantBId];
  const losers = [thirdPlace.participantAId, thirdPlace.participantBId];
  assert.deepEqual(losers, expectedLosers);
});
