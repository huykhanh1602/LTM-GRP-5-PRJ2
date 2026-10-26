import { randomUUID } from 'node:crypto';
import { createMatchStore } from '../net/storage/matchStore.js';

// Fake 8 đội / 24 thành viên đấu vòng tròn cấp Đội, có cả trận hoà để xem bảng xếp hạng.
const TEAMS = [
  { tag: 'sua', name: 'Búa Sắt 🔨', strength: 98, members: ['Nguyễn An', 'Trần Bình', 'Lê Cường'] },
  { tag: 'nap', name: 'Nạp Đạn 💥', strength: 90, members: ['Phạm Dân', 'Hoàng Em', 'Vũ Gan'] },
  { tag: 'keo', name: 'Kéo Cắt ✂️', strength: 88, members: ['Đặng Hà', 'Bùi Em', 'Ngô Giang'] },
  { tag: 'khu', name: 'Khu Rừng 🌲', strength: 84, members: ['Lý Hoa', 'Trịnh Haru', 'Đỗ Ice'] },
  { tag: 'bao', name: 'Bão Biển 🌊', strength: 82, members: ['Bùi Jet', 'Quang King', 'Tú Loan'] },
  { tag: 'ap', name: 'Áp Lực 🔥', strength: 74, members: ['Minh Mai', 'Long Nam', 'Sơn Opal'] },
  { tag: 'bom', name: 'Bóm Bẻm 🧨', strength: 67, members: ['Hà Phúc', 'Hải Quế', 'Dương Sen'] },
  { tag: 'do', name: 'Đỏ Lè 🔴', strength: 61, members: ['Trung Úy', 'Khoa Vy', 'Yến Zalo'] },
];

const store = createMatchStore({ filename: 'data/game.sqlite' });
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const tournamentId = randomUUID();
const now = () => new Date().toISOString();
const DRAW_GAP = 3;

try {
  const roster = TEAMS.map((team, index) => {
    const teamId = `rr-${team.tag.trim()}-${suffix}`;
    store.registerTeam({ id: teamId, name: team.name });
    const members = team.members.map((displayName, memberIndex) => {
      const userId = `${teamId.replace(/[^a-z0-9-]/g, '')}-${memberIndex + 1}`;
      store.upsertUser({ id: userId, display_name: displayName });
      store.addTeamMember(teamId, userId, memberIndex === 0 ? 'captain' : 'member');
      return userId;
    });
    return { ...team, id: teamId, seed: index + 1, captain: members[0], members };
  });

  const tournament = store.createTournament({
    id: tournamentId,
    gameId: 'rps_chess',
    code: `RR-CUP-${suffix}`,
    name: `Cup Vòng Tròn 8 Đội ${suffix}`,
    format: 'round_robin',
    startsAt: now(),
    config: {
      organizerId: roster[0].captain,
      organizerName: TEAMS[0].members[0],
      participantMode: 'TEAM',
      roundSubmissionMode: 'PER_ROUND',
      submissionWindowMinutes: 10,
      maxParticipants: 8,
      rules: ['Mỗi đội gặp tất cả đội khác một lần', 'Thắng 3 điểm, hoà 1 điểm'],
      languages: ['python'],
      registrationOpensAt: new Date(Date.now() - 3600_000).toISOString(),
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  });
  console.log(`tournament=${tournament.id} code=${tournament.code} status=${tournament.status}`);

  for (const team of roster) store.addTournamentEntry(tournamentId, { teamId: team.id, userId: team.captain });
  store.updateTournamentRegistrationWindow(tournamentId, {
    registrationOpensAt: new Date(Date.now() - 3600_000).toISOString(),
    registrationClosesAt: new Date(Date.now() - 60_000).toISOString(),
    startsAt: now(),
  });

  const started = store.generateTournamentBracket(tournamentId);
  console.log(`bracket: totalRounds=${started.bracket.totalRounds} slots=${started.bracket.rounds.map((r) => r.length).join(',')}`);

  const strengthOf = (id) => roster.find((team) => team.id === id).strength;
  const rawRounds = store.getTournament(tournamentId).rounds;
  // --stop-after=N: dừng sau N vòng để xem giải đang diễn ra (vòng kế chờ chủ giải mở).
  const stopAfter = Number(process.argv.find((arg) => arg.startsWith('--stop-after='))?.split('=')[1]
    ?? started.bracket.totalRounds);

  for (let roundNo = 1; roundNo <= started.bracket.totalRounds; roundNo += 1) {
    if (roundNo > stopAfter) break;
    const roundRow = rawRounds.find((row) => Number(row.round_no) === roundNo);
    if (roundNo > 1) {
      store.updateRoundSchedule(tournamentId, roundRow.id, now(), 1);
      store.triggerRoundStart(tournamentId, roundRow.id);
    }
    // Mỗi đội nộp bot cho vòng này, giống luồng thật.
    for (const team of roster) {
      const submission = store.saveBotSubmission({
        roomId: `cup-${suffix}-r${roundNo}`,
        teamId: team.id,
        filename: 'bot.py',
        source: `# ${team.name} round ${roundNo}\ndef act(state):\n    return "ATTACK"\n`,
      });
      store.setEntrySubmission(tournamentId, { teamId: team.id, submissionId: submission.id });
    }

    const slots = store.getTournament(tournamentId).bracket.rounds[roundNo - 1];
    for (const slot of slots) {
      const gap = Math.abs(strengthOf(slot.participantAId) - strengthOf(slot.participantBId));
      const draw = gap <= DRAW_GAP;
      const winnerId = draw ? null : strengthOf(slot.participantAId) > strengthOf(slot.participantBId)
        ? slot.participantAId : slot.participantBId;
      const matchId = randomUUID();
      store.startMatch({
        id: matchId,
        roomId: `cup-${suffix}-r${roundNo}s${slot.slotIndex}`,
        gameId: 'rps_chess',
        mode: 'tournament',
        roundId: roundRow.id,
        ranked: false,
        initialState: [],
        config: { board: { width: 8, height: 8 }, tournament_code: `RR-CUP-${suffix}` },
        startedAt: now(),
        teamA: { id: slot.participantAId, name: slot.participantAName },
        teamB: { id: slot.participantBId, name: slot.participantBName },
      });
      for (let turn = 1; turn <= 6; turn += 1) {
        const player = turn % 2 ? slot.participantAId : slot.participantBId;
        store.appendTurn(matchId, {
          turn,
          player,
          actions: [{ type: 'move', dx: turn % 3 - 1, dy: turn % 2 }],
          events: [{ type: 'turn', turn, side: player === slot.participantAId ? 'A' : 'B' }],
          state: [],
        });
      }
      store.finishMatch(matchId,
        draw ? { draw: true, reason: 'TURN_LIMIT' } : { winner: winnerId, reason: 'BASE_CAPTURED' },
        [], now());
      store.attachSlotResult(tournamentId, { roundNo, slotIndex: slot.matchIndex, matchId });
      console.log(`  vòng ${roundNo} trận ${slot.matchIndex + 1}: ${slot.participantAName} vs ${slot.participantBName} -> ${draw ? 'HOA' : winnerId}`);
    }
  }

  const done = store.getTournament(tournamentId);
  console.log(`status=${done.status} champion=${done.champion ? done.champion.id : 'none'}`);
  console.log(`openId=${tournamentId}`);
} finally {
  store.close();
}
