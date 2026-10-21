import {
  BracketError,
  advanceWinner,
  autoAdvanceByes,
  bindMatch,
  buildSeedOrder,
  createSlot,
  findSlotByMatchId,
  nextPowerOfTwo,
  readySlots,
  releaseMatch,
  seedParticipants,
} from '../../../domain/tournament/Bracket.js';
import { SlotStatus } from '../../../../shared/domain/tournament.js';

export function createSingleEliminationFormat() {
  return {
    id: 'single_elimination',

    generate(participants, options = {}) {
      if (!Array.isArray(participants) || participants.length < 2) {
        throw new BracketError('NOT_ENOUGH_PARTICIPANTS', 'Cần ít nhất 2 participant.');
      }

      const seeded = seedParticipants(participants, options);
      const size = nextPowerOfTwo(Math.max(2, seeded.length));
      const order = buildSeedOrder(size);

      const firstRound = [];
      for (let i = 0; i < size; i += 2) {
        const a = seeded[order[i]] ?? null;
        const b = seeded[order[i + 1]] ?? null;
        firstRound.push(createSlot({
          roundIndex: 0,
          matchIndex: i / 2,
          participantAId: a?.userId ?? null,
          participantBId: b?.userId ?? null,
        }));
      }

      const rounds = [firstRound];
      while (rounds.at(-1).length > 1) {
        const previous = rounds.at(-1);
        const next = Array.from({ length: previous.length / 2 }, (_, matchIndex) =>
          createSlot({
            roundIndex: rounds.length,
            matchIndex,
          }));
        rounds.push(next);
      }

      const bracket = {
        format: 'single_elimination',
        rounds,
        participants: seeded.map((entry) => ({ ...entry })),
      };

      return autoAdvanceByes(bracket);
    },

    applyResult(bracket, report) {
      const slot = findSlotByMatchId(bracket, report.matchId);
      if (!slot) {
        throw new BracketError('MATCH_NOT_FOUND', `Không tìm thấy match ${report.matchId}`);
      }
      if (slot.status === SlotStatus.DONE) {
        return { changed: false, slot };
      }
      if (report.outcome === 'draw') {
        throw new BracketError('DRAW_NOT_ALLOWED', 'Single elimination không chấp nhận draw.');
      }
      if (report.outcome !== 'a' && report.outcome !== 'b') {
        throw new BracketError('INVALID_OUTCOME', `Outcome không hợp lệ: ${report.outcome}`);
      }
      if (!slot.participantAId || !slot.participantBId) {
        throw new BracketError('SLOT_NOT_READY', `Slot ${slot.matchKey} chưa đủ người.`);
      }

      slot.winnerId = report.outcome === 'a'
        ? slot.participantAId
        : slot.participantBId;
      slot.status = SlotStatus.DONE;

      advanceWinner(bracket, slot);
      autoAdvanceByes(bracket);
      return { changed: true, slot };
    },

    status(bracket) {
      const finalSlot = bracket.rounds.at(-1)?.[0];
      return {
        complete: Boolean(finalSlot?.winnerId),
        championId: finalSlot?.winnerId ?? null,
      };
    },

    readySlots,
    bindMatch,
    releaseMatch,
  };
}
