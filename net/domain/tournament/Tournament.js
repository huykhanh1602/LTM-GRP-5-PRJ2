import {
  TournamentStatus,
  ParticipantMode,
  RoundSubmissionMode,
  assertTournamentTransition,
} from '../../../shared/domain/tournament.js';

export function createTournament({
  id,
  gameId,
  code,
  name,
  format,
  config = {},
  entries = [],
  createdAt,
}) {
  if (!id || !gameId || !code || !name || !format) {
    throw new Error('Thiếu thông tin bắt buộc của tournament.');
  }
  if (!Array.isArray(entries)) throw new Error('entries phải là array.');
  assertUniqueEntries(entries);

  return {
    id,
    gameId,
    code,
    name,
    format,
    status: TournamentStatus.DRAFT,
    config: {
      minParticipants: 4,
      maxParticipants: 64,
      drawPolicy: 'replay',
      maxReplays: 3,
      matchConfig: {},
      participantMode: ParticipantMode.INDIVIDUAL,
      minTeamSize: 1,
      maxTeamSize: 5,
      startType: 'AUTO',
      roundSubmissionMode: RoundSubmissionMode.SINGLE,
      submissionWindowMinutes: 10,
      ...config,
    },
    entries: entries.map((entry) => ({ ...entry })),
    bracket: null,
    championId: null,
    createdAt: createdAt ?? new Date().toISOString(),
    startedAt: null,
    endedAt: null,
  };
}

export function openTournament(tournament) {
  assertTournamentTransition(tournament.status, TournamentStatus.OPEN);
  tournament.status = TournamentStatus.OPEN;
  return tournament;
}

export function startTournament(tournament, bracket, at) {
  assertTournamentTransition(tournament.status, TournamentStatus.IN_PROGRESS);
  if (!bracket) throw new Error('startTournament cần bracket.');
  tournament.status = TournamentStatus.IN_PROGRESS;
  tournament.bracket = bracket;
  tournament.startedAt = at;
  return tournament;
}

export function completeTournament(tournament, championId, at) {
  assertTournamentTransition(tournament.status, TournamentStatus.COMPLETED);
  if (!championId) throw new Error('completed tournament phải có championId.');
  tournament.status = TournamentStatus.COMPLETED;
  tournament.championId = championId;
  tournament.endedAt = at;
  return tournament;
}

export function cancelTournament(tournament, at) {
  assertTournamentTransition(tournament.status, TournamentStatus.CANCELLED);
  tournament.status = TournamentStatus.CANCELLED;
  tournament.endedAt = at;
  return tournament;
}

export function toTournamentView(tournament) {
  return {
    id: tournament.id,
    gameId: tournament.gameId,
    code: tournament.code,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
    config: tournament.config,
    entries: tournament.entries.map((entry) => ({ ...entry })),
    bracket: tournament.bracket,
    championId: tournament.championId,
    createdAt: tournament.createdAt,
    startedAt: tournament.startedAt,
    endedAt: tournament.endedAt,
  };
}

function assertUniqueEntries(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.userId && !entry?.teamId) throw new Error('Entry thiếu userId hoặc teamId.');
    const key = entry.teamId ?? entry.userId;
    if (seen.has(key)) {
      throw new Error(`Entry trùng: ${key}`);
    }
    seen.add(key);
  }
}
