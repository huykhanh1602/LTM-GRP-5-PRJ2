import { SlotStatus } from '../../../shared/domain/tournament.js';

export class BracketError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BracketError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

// Sinh thứ tự seed chuẩn: 1 gặp cuối bảng, 2 gặp áp cuối...
// Ví dụ size=8 -> [1,8,4,5,2,7,3,6], trả về index 0-based.
export function buildSeedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const next = [];
    const sum = order.length * 2 + 1;
    for (const seed of order) next.push(seed, sum - seed);
    order = next;
  }
  return order.map((seed) => seed - 1);
}

export function seedParticipants(participants, {
  seed = 'rating',
  random = Math.random,
} = {}) {
  const list = [...participants];

  if (seed === 'manual') return list;

  if (seed === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  return list.sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    const seedDiff = (a.seed ?? Number.MAX_SAFE_INTEGER) -
      (b.seed ?? Number.MAX_SAFE_INTEGER);
    if (seedDiff !== 0) return seedDiff;
    return String(a.userId).localeCompare(String(b.userId));
  });
}

export function createSlot({
  roundIndex,
  matchIndex,
  participantAId = null,
  participantBId = null,
  matchId = null,
  winnerId = null,
  status = null,
  replayCount = 0,
}) {
  return {
    matchKey: `r${roundIndex}m${matchIndex}`,
    roundIndex,
    matchIndex,
    participantAId,
    participantBId,
    matchId,
    winnerId,
    status: status ?? (participantAId && participantBId
      ? SlotStatus.READY
      : SlotStatus.PENDING),
    replayCount,
  };
}

export function allSlots(bracket) {
  return bracket.rounds.flat();
}

export function findSlotByMatchId(bracket, matchId) {
  if (!matchId) return null;
  return allSlots(bracket).find((slot) => slot.matchId === matchId) ?? null;
}

export function findSlotByKey(bracket, matchKey) {
  return allSlots(bracket).find((slot) => slot.matchKey === matchKey) ?? null;
}

export function bindMatch(bracket, matchKey, matchId) {
  const slot = findSlotByKey(bracket, matchKey);
  if (!slot) throw new BracketError('SLOT_NOT_FOUND', `Không tìm thấy slot ${matchKey}`);
  if (slot.status !== SlotStatus.READY) {
    throw new BracketError('SLOT_NOT_READY', `Slot ${matchKey} không ở trạng thái ready`);
  }
  slot.matchId = matchId;
  slot.status = SlotStatus.RUNNING;
  return slot;
}

export function releaseMatch(bracket, matchKey) {
  const slot = findSlotByKey(bracket, matchKey);
  if (!slot) return null;
  slot.matchId = null;
  slot.status = slot.participantAId && slot.participantBId
    ? SlotStatus.READY
    : SlotStatus.PENDING;
  return slot;
}

export function readySlots(bracket) {
  return allSlots(bracket).filter(
    (slot) => slot.status === SlotStatus.READY && !slot.matchId,
  );
}

export function advanceWinner(bracket, slot) {
  const nextRound = bracket.rounds[slot.roundIndex + 1];
  if (!nextRound || !slot.winnerId) return;

  const nextSlot = nextRound[Math.floor(slot.matchIndex / 2)];
  const side = slot.matchIndex % 2 === 0 ? 'participantAId' : 'participantBId';
  const current = nextSlot[side];

  if (current && current !== slot.winnerId) {
    throw new BracketError(
      'BRACKET_CONFLICT',
      `Xung đột nhánh tại ${nextSlot.matchKey}: ${current} vs ${slot.winnerId}`,
    );
  }
  nextSlot[side] = slot.winnerId;
}

export function autoAdvanceByes(bracket) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const slot of allSlots(bracket)) {
      if (slot.status === SlotStatus.DONE ||
          slot.status === SlotStatus.BYE ||
          slot.status === SlotStatus.RUNNING) {
        continue;
      }

      const hasA = Boolean(slot.participantAId);
      const hasB = Boolean(slot.participantBId);

      if (hasA && hasB) {
        if (slot.status === SlotStatus.PENDING) {
          slot.status = SlotStatus.READY;
          changed = true;
        }
        continue;
      }

      // Chỉ bye ở vòng đầu do bracket padding.
      // Vòng sau phải chờ winner từ nhánh còn lại, không được tự bye.
      if (slot.roundIndex !== 0) continue;
      if (!hasA && !hasB) continue;

      slot.winnerId = slot.participantAId ?? slot.participantBId;
      slot.status = SlotStatus.BYE;
      advanceWinner(bracket, slot);
      changed = true;
    }
  }
  return bracket;
}
