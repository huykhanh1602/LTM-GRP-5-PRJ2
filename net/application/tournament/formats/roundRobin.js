import {
  BracketError,
  bindMatch,
  createSlot,
  findSlotByMatchId,
  readySlots,
  releaseMatch,
  seedParticipants,
} from '../../../domain/tournament/Bracket.js';
import { SlotStatus } from '../../../../shared/domain/tournament.js';

export function createRoundRobinFormat() {
  return {
    id: 'round_robin',

    generate(participants, options = {}) {
      if (!Array.isArray(participants) || participants.length < 2) {
        throw new BracketError('NOT_ENOUGH_PARTICIPANTS', 'Cần ít nhất 2 participant.');
      }

      const seeded = seedParticipants(participants, options);
      const players = seeded.length % 2 ? [...seeded, null] : [...seeded];
      const rounds = [];
      const rotation = [...players];

      for (let roundIndex = 0; roundIndex < players.length - 1; roundIndex++) {
        const slots = [];
        for (let i = 0; i < players.length / 2; i++) {
          const a = rotation[i];
          const b = rotation[players.length - 1 - i];
          if (a && b) {
            slots.push(createSlot({
              roundIndex,
              matchIndex: slots.length,
              participantAId: a.userId,
              participantBId: b.userId,
              status: SlotStatus.READY,
            }));
          }
        }
        rounds.push(slots);
        rotation.splice(1, 0, rotation.pop());
      }

      if (options.doubleRound) {
        const firstLeg = rounds.map((round) => round.map((slot) => ({ ...slot })));
        const secondLeg = firstLeg.map((round, index) =>
          round.map((slot) => createSlot({
            roundIndex: rounds.length + index,
            matchIndex: slot.matchIndex,
            participantAId: slot.participantBId,
            participantBId: slot.participantAId,
            status: SlotStatus.READY,
          })));
        rounds.push(...secondLeg);
      }

      return {
        format: 'round_robin',
        rounds,
        participants: seeded.map((entry) => ({ ...entry })),
      };
    },

    applyResult(bracket, report) {
      const slot = findSlotByMatchId(bracket, report.matchId);
      if (!slot) {
        throw new BracketError('MATCH_NOT_FOUND', `Không tìm thấy match ${report.matchId}`);
      }
      if (slot.status === SlotStatus.DONE) {
        return { changed: false, slot };
      }
      if (!['a', 'b', 'draw'].includes(report.outcome)) {
        throw new BracketError('INVALID_OUTCOME', `Outcome không hợp lệ: ${report.outcome}`);
      }

      slot.winnerId = report.outcome === 'draw'
        ? null
        : report.outcome === 'a'
          ? slot.participantAId
          : slot.participantBId;
      slot.status = SlotStatus.DONE;
      return { changed: true, slot };
    },

    status(bracket) {
      const slots = bracket.rounds.flat();
      const complete = slots.length > 0 &&
        slots.every((slot) => slot.status === SlotStatus.DONE);

      if (!complete) return { complete: false, championId: null };

      const table = standings(bracket);
      const top = table[0];
      const second = table[1];
      const unique = top && (
        !second ||
        top.points !== second.points ||
        top.wins !== second.wins ||
        top.headToHeadPoints !== second.headToHeadPoints
      );

      return {
        complete: true,
        championId: unique ? top.userId : null,
        requiresTiebreak: !unique,
        standings: table,
      };
    },

    standings,
    readySlots,
    bindMatch,
    releaseMatch,
  };
}

export function standings(bracket) {
  const table = new Map();

  for (const participant of bracket.participants ?? []) {
    table.set(participant.userId, {
      userId: participant.userId,
      displayName: participant.displayName ?? participant.userId,
      seed: participant.seed ?? null,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      headToHeadPoints: 0,
    });
  }

  for (const slot of bracket.rounds.flat()) {
    if (slot.status !== SlotStatus.DONE) continue;
    const a = table.get(slot.participantAId);
    const b = table.get(slot.participantBId);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;

    if (!slot.winnerId) {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    } else if (slot.winnerId === a.userId) {
      a.wins += 1;
      a.points += 3;
      b.losses += 1;
    } else {
      b.wins += 1;
      b.points += 3;
      a.losses += 1;
    }
  }

  const rows = [...table.values()];
  sortStandings(rows);

  // Head-to-head chỉ tính trong nhóm cùng points và wins.
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length &&
           rows[end].points === rows[start].points &&
           rows[end].wins === rows[start].wins) {
      end += 1;
    }

    if (end - start > 1) {
      const group = new Set(rows.slice(start, end).map((row) => row.userId));
      const headToHead = new Map([...group].map((userId) => [userId, 0]));

      for (const slot of bracket.rounds.flat()) {
        if (slot.status !== SlotStatus.DONE) continue;
        if (!group.has(slot.participantAId) || !group.has(slot.participantBId)) continue;

        if (!slot.winnerId) {
          headToHead.set(slot.participantAId, headToHead.get(slot.participantAId) + 1);
          headToHead.set(slot.participantBId, headToHead.get(slot.participantBId) + 1);
        } else {
          headToHead.set(slot.winnerId, headToHead.get(slot.winnerId) + 3);
        }
      }

      for (let i = start; i < end; i++) {
        rows[i].headToHeadPoints = headToHead.get(rows[i].userId) ?? 0;
      }
      sortStandings(rows);
    }

    start = end;
  }

  return rows;
}

function sortStandings(rows) {
  rows.sort((x, y) =>
    y.points - x.points ||
    y.wins - x.wins ||
    y.headToHeadPoints - x.headToHeadPoints ||
    (x.seed ?? Number.MAX_SAFE_INTEGER) - (y.seed ?? Number.MAX_SAFE_INTEGER) ||
    x.userId.localeCompare(y.userId),
  );
}
