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

// Vòng tròn (circle method): số lẻ thì mỗi vòng có một suất nghỉ, không đấu với chính mình.
export function roundRobinPairs(entries) {
  const players = entries.length % 2 ? [...entries, null] : [...entries];
  const rotation = [...players];
  const rounds = [];
  for (let index = 0; index < players.length - 1; index += 1) {
    const slots = [];
    for (let i = 0; i < players.length / 2; i += 1) {
      const a = rotation[i];
      const b = rotation[players.length - 1 - i];
      if (a && b) slots.push({ a, b });
    }
    rounds.push(slots);
    rotation.splice(1, 0, rotation.pop());
  }
  return rounds;
}

// Bảng điểm vòng tròn: thắng 3, hoà 1; bằng nhau thì so đối đầu trực tiếp rồi hạt giống.
export function roundRobinStandings({ matches = [], participants = [] }) {
  const table = new Map(participants.map((entry) => [entry.id, {
    entryId: entry.id, seed: entry.seed ?? null,
    played: 0, wins: 0, draws: 0, losses: 0, points: 0, headToHead: 0,
  }]));
  const decided = matches.filter((match) => match.decided);
  const score = (id, add) => {
    const row = table.get(id);
    if (row) row.headToHead += add;
  };
  const sort = (rows) => rows.sort((x, y) =>
    y.points - x.points || y.wins - x.wins || y.headToHead - x.headToHead ||
    (x.seed ?? 999) - (y.seed ?? 999) || String(x.entryId).localeCompare(String(y.entryId)));

  for (const match of decided) {
    const a = table.get(match.participantAId);
    const b = table.get(match.participantBId);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    if (!match.winnerId) {
      a.draws += 1; b.draws += 1; a.points += 1; b.points += 1;
    } else if (match.winnerId === a.entryId) {
      a.wins += 1; a.points += 3; b.losses += 1;
    } else {
      b.wins += 1; b.points += 3; a.losses += 1;
    }
  }

  const rows = [...table.values()];
  sort(rows);
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length && rows[end].points === rows[start].points && rows[end].wins === rows[start].wins) {
      end += 1;
    }
    if (end - start > 1) {
      const group = new Set(rows.slice(start, end).map((row) => row.entryId));
      for (const match of decided) {
        if (!group.has(match.participantAId) || !group.has(match.participantBId)) continue;
        if (!match.winnerId) {
          score(match.participantAId, 1);
          score(match.participantBId, 1);
        } else score(match.winnerId, 3);
      }
      sort(rows);
    }
    start = end;
  }
  return rows;
}

// Quán quân vòng tròn: chỉ khi top 1 không bằng điểm về mọi chỉ số.
export function roundRobinChampion(rows = []) {
  const top = rows[0];
  const second = rows[1];
  if (!top) return null;
  const tied = second
    && top.points === second.points && top.wins === second.wins && top.headToHead === second.headToHead;
  return tied ? null : top.entryId;
}

function isBye(id) {
  return id === BYE_ID || id === null || id === undefined;
}

function slotFromRow(row, roundIndex, matchIndex, scheduledAt = null) {
  const result = row.result ?? null;
  const bye = Boolean(result?.bye);
  const winnerId = row.winner_id ?? null;
  // Older history rows may only keep the source match ID in result_json.
  const matchId = row.match_id ?? result?.source_match_id ?? null;
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
    matchId,
    replayId: matchId,
    result,
    playedAt: row.played_at ?? null,
    scheduledAt,
    // Có result_json là đã chốt (kể cả hoà, winner_id null).
    status: bye ? "bye" : winnerId || result ? "done" : "ready",
  };
}

function pendingSlot(roundIndex, matchIndex, roundId, a, b, scheduledAt = null) {
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
    scheduledAt,
    status: known === 2 ? 'ready' : 'pending',
  };
}

// rounds: [{ id, round_no, matches: [historyRow] }] đã sắp theo round_no.
// Vòng tròn đã biết sẵn mọi cặp ngay từ đầu nên chỉ cần dựng lại từ dữ liệu đã ghi.
export function buildBracket({ rounds = [], entryCount = 0, format = 'single_elimination' } = {}) {
  if (format === 'round_robin') {
    const built = rounds.map((round, roundIndex) => (round.matches ?? [])
      .map((row, matchIndex) => slotFromRow(row, roundIndex, Number(row.slot_index ?? matchIndex), round.scheduled_at ?? null)));
    return { format: 'round_robin', size: entryCount, totalRounds: built.length, rounds: built };
  }

  const { size, totalRounds } = planSize(entryCount);
  const byRound = new Map(rounds.map((round) => [Number(round.round_no), round]));
  const built = [];

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const roundNo = roundIndex + 1;
    const round = byRound.get(roundNo) ?? null;
    const expected = Math.max(1, size / 2 ** roundNo);
    const scheduledAt = round?.scheduled_at ?? null;
    const rows = new Map(
      (round?.matches ?? []).map((row) => [Number(row.slot_index ?? 0), row]),
    );
    const slots = [];

    for (let matchIndex = 0; matchIndex < expected; matchIndex += 1) {
      const row = rows.get(matchIndex);
      if (row) {
        slots.push(slotFromRow(row, roundIndex, matchIndex, scheduledAt));
        continue;
      }
      const previous = built[roundIndex - 1];
      if (!previous) {
        slots.push(pendingSlot(roundIndex, matchIndex, round?.id ?? null, null, null, scheduledAt));
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
        pendingSlot(roundIndex, matchIndex, round?.id ?? null, advance(feederA), advance(feederB), scheduledAt),
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
