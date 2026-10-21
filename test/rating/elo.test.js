import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEloPair,
  DEFAULT_ELO_CONFIG,
  kFactorFor,
} from '../../net/domain/rating/Elo.js';

const player = (userId, rating = 1000, gamesPlayed = 20) => ({
  userId,
  rating,
  gamesPlayed,
});

test('hai người cùng rating: thắng +16, thua -16', () => {
  const result = calculateEloPair({
    playerA: player('a'),
    playerB: player('b'),
    outcome: 'a',
    config: DEFAULT_ELO_CONFIG,
  });

  assert.equal(result.a.change, 16);
  assert.equal(result.b.change, -16);
  assert.equal(result.a.after, 1016);
  assert.equal(result.b.after, 984);
});

test('hòa giữa hai người cùng rating: không đổi', () => {
  const result = calculateEloPair({
    playerA: player('a'),
    playerB: player('b'),
    outcome: 'draw',
    config: DEFAULT_ELO_CONFIG,
  });

  assert.equal(result.a.change, 0);
  assert.equal(result.b.change, 0);
});

test('người mới chơi dùng K tạm thời', () => {
  assert.equal(kFactorFor(0, DEFAULT_ELO_CONFIG), 40);
  assert.equal(kFactorFor(20, DEFAULT_ELO_CONFIG), 32);

  const result = calculateEloPair({
    playerA: player('a', 1000, 0),
    playerB: player('b', 1000, 20),
    outcome: 'a',
    config: DEFAULT_ELO_CONFIG,
  });

  assert.equal(result.a.k, 40);
  assert.equal(result.b.k, 32);
});

test('không cho phép hai participant trùng userId', () => {
  assert.throws(() => calculateEloPair({
    playerA: player('same'),
    playerB: player('same'),
    outcome: 'a',
  }), /khác userId/);
});
