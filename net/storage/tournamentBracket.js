// Sơ đồ nhánh Single Elimination dựng từ dữ liệu thật trong DB.
// Mỗi trận đã ghi nằm ở tournament_match_history (round_id + slot_index);
// các slot chưa có kết quả được suy ra từ người thắng của vòng trước.

export const BYE_ID = '__BYE__';
export const BYE_NAME = 'Bye (đi thẳng)';

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

// Số đấu thủ sau khi bù bye và tổng số vòng.
export function planSize(entryCount) {
  const size = Math.max(2, nextPowerOfTwo(entryCount));
  return { size, totalRounds: Math.round(Math.log2(size)) };
}

// Thứ tự xếp hạt giống chuẩn: hạt số 1 gặp bye, các cặp mạnh-yếu so le nhau.
export function seedPositions(size) {
  let positions = [1];
  while (positions.length < size) {
    const roundSize = positions.length * 2;
    positions = positions.flatMap((position) => [position, roundSize + 1 - position]);
  }
  return positions;
}

export function slotCount(totalEntries, roundNo) {
  const { size } = planSize(totalEntries);
  return Math.max(1, size / 2 ** roundNo);
}

// Ghép cặp vòng 1: trả về mảng slot, mỗi slot { a, b } (null = bye).
export function pairFirstRound(entries) {
  const { size } = planSize(entries.length);
  const ordered = seedPositions(size).map((seed) => entries[seed - 1] ?? null);
  const slots = [];
  for (let index = 0; index < ordered.length; index += 2) {
    slots.push({ a: ordered[index], b: ordered[index + 1] ?? null });
  }
  return slots;
}

function isBye(id) {
  return id === BYE_ID || id === null || id === undefined;
}

function slotFromRow(row, roundIndex, matchIndex) {
  const result = row.result ?? null;
  const bye = Boolean(result?.bye);
  const winnerId = row.winner_id ?? null;
  return {
    slotId: row.id,
    matchKey: `r${roundIndex}m${matchIndex}`,
    roundNo: roundIndex + 1,
    roundIndex,
    matchIndex,
    roundId: row.round_id,
    participantAId: row.participant_a_id,
    participantBId: row.participant_b_id,
    participantAName: row.participant_a_name,
    participantBName: row.participant_b_name,
    winnerId: row.winner_id ?? null,
    matchId: row.match_id ?? null,
    result,
    playedAt: row.played_at ?? null,
    status: bye ? 'bye' : winnerId ? 'done' : 'ready',
  };
}

function pendingSlot(roundIndex, matchIndex, roundId, a, b) {
  const known = [a, b].filter(Boolean).length;
  return {
    slotId: null,
    matchKey: `r${roundIndex}m${matchIndex}`,
    roundNo: roundIndex + 1,
    roundIndex,
    matchIndex,
    roundId,
    participantAId: a?.id ?? null,
    participantBId: b?.id ?? null,
    participantAName: a?.name ?? null,
    participantBName: b?.name ?? null,
    winnerId: null,
    matchId: null,
    result: null,
    playedAt: null,
    status: known === 2 ? 'ready' : 'pending',
  };
}

// rounds: [{ id, round_no, matches: [historyRow] }] đã sắp theo round_no.
export function buildBracket({ rounds = [], entryCount = 0 } = {}) {
  const { size, totalRounds } = planSize(entryCount);
  const byRound = new Map(rounds.map((round) => [Number(round.round_no), round]));
  const built = [];

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const roundNo = roundIndex + 1;
    const round = byRound.get(roundNo) ?? null;
    const expected = Math.max(1, size / 2 ** roundNo);
    const rows = new Map(
      (round?.matches ?? []).map((row) => [Number(row.slot_index ?? 0), row]),
    );
    const slots = [];

    for (let matchIndex = 0; matchIndex < expected; matchIndex += 1) {
      const row = rows.get(matchIndex);
      if (row) {
        slots.push(slotFromRow(row, roundIndex, matchIndex));
        continue;
      }
      const previous = built[roundIndex - 1];
      if (!previous) {
        slots.push(pendingSlot(roundIndex, matchIndex, round?.id ?? null, null, null));
        continue;
      }
      const feederA = previous[matchIndex * 2];
      const feederB = previous[matchIndex * 2 + 1];
      const advance = (feeder) => {
        if (!feeder || !feeder.winnerId || isBye(feeder.winnerId)) return null;
        const isA = feeder.winnerId === feeder.participantAId;
        return {
          id: feeder.winnerId,
          name: isA ? feeder.participantAName : feeder.participantBName,
        };
      };
      slots.push(
        pendingSlot(roundIndex, matchIndex, round?.id ?? null, advance(feederA), advance(feederB)),
      );
    }

    built.push(slots);
  }

  return { format: 'single_elimination', size, totalRounds, rounds: built };
}

// Slot kế tiếp nhận người thắng của (roundNo, slotIndex).
export function nextSlotOf(roundNo, slotIndex) {
  return { roundNo: roundNo + 1, slotIndex: Math.floor(slotIndex / 2), side: slotIndex % 2 === 0 ? 'a' : 'b' };
}
