import { randomUUID } from 'node:crypto';

import { TournamentFormat, ParticipantMode } from '../../../shared/domain/tournament.js';
import {
  BracketError,
  findSlotByMatchId,
} from '../../domain/tournament/Bracket.js';
import {
  completeTournament,
  createTournament,
  openTournament,
  startTournament,
  toTournamentView,
} from '../../domain/tournament/Tournament.js';

export class TournamentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TournamentError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function createTournamentService({
  tournaments,
  matchQueue,
  formats,
  clock = () => new Date(),
  ids = { next: () => randomUUID() },
  events = null,
  userStore = null,
  teamStore = null,
} = {}) {
  if (!tournaments) throw new Error('TournamentService cần tournament repository.');
  if (!matchQueue) throw new Error('TournamentService cần matchQueue.');
  if (!formats) throw new Error('TournamentService cần formats.');

  async function create(input) {
    if (!formats.has(input.format)) {
      throw new TournamentError('UNSUPPORTED_FORMAT', `Format không hỗ trợ: ${input.format}`);
    }

    // Validate participant_mode config
    const participantMode = input.config?.participantMode ?? ParticipantMode.INDIVIDUAL;
    if (![ParticipantMode.INDIVIDUAL, ParticipantMode.TEAM].includes(participantMode)) {
      throw new TournamentError('INVALID_CONFIG', `participantMode không hợp lệ: ${participantMode}`);
    }
    if (participantMode === ParticipantMode.TEAM) {
      const minSize = input.config?.minTeamSize ?? 1;
      const maxSize = input.config?.maxTeamSize ?? 5;
      if (!Number.isSafeInteger(minSize) || minSize < 1) {
        throw new TournamentError('INVALID_CONFIG', 'minTeamSize phải >= 1');
      }
      if (!Number.isSafeInteger(maxSize) || maxSize < minSize) {
        throw new TournamentError('INVALID_CONFIG', 'maxTeamSize phải >= minTeamSize');
      }
    }

    const tournament = createTournament({
      ...input,
      createdAt: clock().toISOString(),
    });

    await tournaments.create(tournament);
    events?.publish?.('TOURNAMENT_CREATED', { tournamentId: tournament.id });
    return toTournamentView(tournament);
  }

  async function get(id) {
    return toTournamentView(await tournaments.get(id));
  }

  async function open(id) {
    const updated = await tournaments.transaction(async (tx) => {
      const tournament = await tx.getForUpdate(id);
      openTournament(tournament);
      await tx.save(tournament);
      return tournament;
    });

    events?.publish?.('TOURNAMENT_OPENED', { tournamentId: id });
    return toTournamentView(updated);
  }

  async function start(id, { seed = 'rating' } = {}) {
    const { tournament, ready } = await tournaments.transaction(async (tx) => {
      const current = await tx.getForUpdate(id);

      if (current.status !== 'open') {
        throw new TournamentError('INVALID_STATE', `Tournament đang ${current.status}, cần open.`);
      }
      if (current.entries.length < current.config.minParticipants) {
        throw new TournamentError(
          'NOT_ENOUGH_PARTICIPANTS',
          `Cần ít nhất ${current.config.minParticipants} người, hiện có ${current.entries.length}.`,
        );
      }
      if (current.entries.length > current.config.maxParticipants) {
        throw new TournamentError('TOO_MANY_PARTICIPANTS', 'Số người vượt maxParticipants.');
      }

      const format = formats.get(current.format);
      const bracket = format.generate(current.entries, {
        seed,
        random: Math.random,
        ...(current.config.formatOptions ?? {}),
      });

      startTournament(current, bracket, clock().toISOString());
      await tx.save(current);
      return { tournament: current, ready: format.readySlots(bracket) };
    });

    await enqueueReadyMatches(tournament, ready);
    events?.publish?.('TOURNAMENT_STARTED', {
      tournamentId: id,
      gameId: tournament.gameId,
    });
    return toTournamentView(tournament);
  }

  async function reportMatch(id, report) {
    if (!report?.matchId) {
      throw new TournamentError('INVALID_REPORT', 'report.matchId là bắt buộc.');
    }

    const { tournament, ready, tiebreakRequired } = await tournaments.transaction(async (tx) => {
      const current = await tx.getForUpdate(id);
      const slot = current.bracket
        ? findSlotByMatchId(current.bracket, report.matchId)
        : null;

      if (!slot) {
        throw new TournamentError('MATCH_NOT_FOUND', `Không tìm thấy match ${report.matchId}`);
      }
      if (slot.status === 'done') {
        return { tournament: current, ready: [], tiebreakRequired: false };
      }
      if (current.status !== 'in_progress') {
        throw new TournamentError('INVALID_STATE', `Tournament đang ${current.status}.`);
      }

      const format = formats.get(current.format);

      // Single elimination: hòa thì replay tối đa maxReplays lần.
      if (report.outcome === 'draw' && current.format === TournamentFormat.SINGLE_ELIMINATION) {
        const policy = current.config.drawPolicy ?? 'replay';
        if (policy !== 'replay') {
          throw new TournamentError(
            'DRAW_NOT_ALLOWED',
            `Draw policy ${policy} không cho phép hòa.`,
          );
        }
        if ((slot.replayCount ?? 0) >= (current.config.maxReplays ?? 3)) {
          throw new TournamentError('MAX_REPLAYS_REACHED', 'Đã vượt số lần replay cho phép.');
        }

        slot.replayCount = (slot.replayCount ?? 0) + 1;
        format.releaseMatch(current.bracket, slot.matchKey);
        await tx.save(current);

        return {
          tournament: current,
          ready: [{ ...slot, matchId: null, status: 'ready' }],
          tiebreakRequired: false,
        };
      }

      try {
        format.applyResult(current.bracket, report);
      } catch (error) {
        if (error instanceof BracketError) {
          throw new TournamentError(error.code, error.message);
        }
        throw error;
      }

      const status = format.status(current.bracket);
      let tiebreakRequired = false;

      if (status.complete) {
        if (status.championId) {
          completeTournament(current, status.championId, clock().toISOString());
        } else {
          tiebreakRequired = true;
        }
      }

      await tx.save(current);
      return {
        tournament: current,
        ready: tiebreakRequired ? [] : format.readySlots(current.bracket),
        tiebreakRequired,
      };
    });

    if (tiebreakRequired) {
      events?.publish?.('TOURNAMENT_TIEBREAK_REQUIRED', { tournamentId: id });
    }

    await enqueueReadyMatches(tournament, ready);
    events?.publish?.('TOURNAMENT_MATCH_REPORTED', {
      tournamentId: id,
      matchId: report.matchId,
      outcome: report.outcome,
    });
    return toTournamentView(tournament);
  }

  async function complete(id, championId = null) {
    const tournament = await tournaments.transaction(async (tx) => {
      const current = await tx.getForUpdate(id);
      const format = formats.get(current.format);
      const status = format.status(current.bracket);

      if (!status.complete) {
        throw new TournamentError('NOT_COMPLETE', 'Giải chưa hoàn tất.');
      }

      const champion = championId ?? status.championId;
      if (!champion) {
        throw new TournamentError(
          'TIEBREAK_REQUIRED',
          'Giải đã hoàn tất nhưng chưa xác định được champion.',
        );
      }
      if (!current.entries.some((entry) => entry.userId === champion)) {
        throw new TournamentError('INVALID_CHAMPION', 'Champion phải là participant của giải.');
      }

      completeTournament(current, champion, clock().toISOString());
      await tx.save(current);
      return current;
    });

    events?.publish?.('TOURNAMENT_COMPLETED', {
      tournamentId: id,
      championId: tournament.championId,
    });
    return toTournamentView(tournament);
  }

  async function standings(id) {
    const tournament = await tournaments.get(id);
    const format = formats.get(tournament.format);
    if (typeof format.standings !== 'function') {
      throw new TournamentError(
        'STANDINGS_NOT_SUPPORTED',
        `Format ${tournament.format} không có standings.`,
      );
    }
    return format.standings(tournament.bracket);
  }

  async function handleMatchFinished({ matchId, outcome, reason = null }) {
    const link = await tournaments.findByMatchId(matchId);
    if (!link) return null;
    return reportMatch(link.tournamentId, { matchId, outcome, reason });
  }

  async function list(query = {}) {
    return tournaments.list(query);
  }

  async function enqueueReadyMatches(tournament, ready) {
    if (!ready?.length) return;

    const prepared = [];

    await tournaments.transaction(async (tx) => {
      const current = await tx.getForUpdate(tournament.id);
      const format = formats.get(current.format);
      const currentReady = new Map(
        format.readySlots(current.bracket).map((slot) => [slot.matchKey, slot]),
      );

      for (const requested of ready) {
        const slot = currentReady.get(requested.matchKey);
        if (!slot) continue;

        const matchId = ids.next();
        format.bindMatch(current.bracket, slot.matchKey, matchId);
        prepared.push({ slot: { ...slot }, matchId });
      }

      await tx.save(current);
    });

    for (const item of prepared) {
      try {
        await matchQueue.enqueue({
          jobId: `tournament:${tournament.id}:${item.slot.matchKey}`,
          matchId: item.matchId,
          tournamentId: tournament.id,
          roundKey: item.slot.matchKey,
          gameId: tournament.gameId,
          mode: 'tournament',
          participants: {
            a: item.slot.participantAId,
            b: item.slot.participantBId,
          },
          config: tournament.config.matchConfig ?? {},
        });
      } catch (error) {
        await tournaments.transaction(async (tx) => {
          const current = await tx.getForUpdate(tournament.id);
          formats.get(current.format).releaseMatch(current.bracket, item.slot.matchKey);
          await tx.save(current);
        });

        throw new TournamentError(
          'MATCH_QUEUE_FAILED',
          `Không enqueue được match ${item.slot.matchKey}: ${error.message}`,
        );
      }
    }
  }

  return {
    create,
    get,
    open,
    start,
    reportMatch,
    complete,
    standings,
    handleMatchFinished,
    list,
  };
}
