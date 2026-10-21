export const DEFAULT_ELO_CONFIG = Object.freeze({
  initialRating: 1000,
  kFactor: 32,
  provisionalKFactor: 40,
  provisionalGames: 10,
  ratingFloor: 100,
  ratingCeiling: 3000,
  // false = dùng K riêng của từng người, đúng công thức Elo tiêu chuẩn.
  // true = ép tổng thay đổi bằng 0, hữu ích nếu giải đấu yêu cầu.
  zeroSum: false,
});

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function kFactorFor(gamesPlayed, config = DEFAULT_ELO_CONFIG) {
  const games = Number.isFinite(gamesPlayed) ? gamesPlayed : 0;
  return games < config.provisionalGames
    ? config.provisionalKFactor
    : config.kFactor;
}

export function calculateEloPair({
  playerA,
  playerB,
  outcome,
  config = DEFAULT_ELO_CONFIG,
}) {
  assertPlayer(playerA, 'A');
  assertPlayer(playerB, 'B');

  if (playerA.userId === playerB.userId) {
    throw new Error('Hai người chơi phải khác userId.');
  }
  if (!['a', 'b', 'draw'].includes(outcome)) {
    throw new Error(`Outcome không hợp lệ: ${outcome}`);
  }

  const scoreA = outcome === 'a' ? 1 : outcome === 'b' ? 0 : 0.5;
  const scoreB = 1 - scoreA;

  const expectedA = expectedScore(playerA.rating, playerB.rating);
  const expectedB = 1 - expectedA;

  const kA = kFactorFor(playerA.gamesPlayed, config);
  const kB = kFactorFor(playerB.gamesPlayed, config);

  const rawChangeA = Math.round(kA * (scoreA - expectedA));
  const rawChangeB = config.zeroSum
    ? -rawChangeA
    : Math.round(kB * (scoreB - expectedB));

  const afterA = clamp(
    playerA.rating + rawChangeA,
    config.ratingFloor,
    config.ratingCeiling,
  );
  const afterB = clamp(
    playerB.rating + rawChangeB,
    config.ratingFloor,
    config.ratingCeiling,
  );

  return {
    outcome,
    a: {
      userId: playerA.userId,
      before: playerA.rating,
      after: afterA,
      change: afterA - playerA.rating,
      k: kA,
      expected: expectedA,
    },
    b: {
      userId: playerB.userId,
      before: playerB.rating,
      after: afterB,
      change: afterB - playerB.rating,
      k: kB,
      expected: expectedB,
    },
  };
}

function assertPlayer(player, side) {
  if (!player || typeof player.userId !== 'string' || !player.userId) {
    throw new Error(`Player ${side} thiếu userId.`);
  }
  if (!Number.isFinite(player.rating)) {
    throw new Error(`Player ${side} có rating không hợp lệ.`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
