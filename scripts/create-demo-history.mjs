import { randomUUID } from 'node:crypto';
import { createMatchStore } from '../net/storage/matchStore.js';

const store = createMatchStore({ filename: 'data/game.sqlite' });
const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const players = [
  { id: `demo-${suffix}-a`, display_name: 'DEMO Bot Đỏ' },
  { id: `demo-${suffix}-b`, display_name: 'DEMO Bot Xanh' },
  { id: `demo-${suffix}-c`, display_name: 'DEMO Bot Vàng' },
  { id: `demo-${suffix}-d`, display_name: 'DEMO Bot Tím' },
];

function ensurePlayer(player) {
  store.upsertUser(player);
  store.registerTeam({ id: player.id, name: player.display_name });
}

function makeFinishedMatch({ a, b, mode, ranked = false, winner = a, label }) {
  const id = randomUUID();
  const startedAt = new Date(Date.now() - 120_000).toISOString();
  store.startMatch({
    id,
    roomId: `demo-${id.slice(0, 8)}`,
    gameId: 'rps_chess',
    mode,
    teamA: { id: a.id, name: a.display_name },
    teamB: { id: b.id, name: b.display_name },
    ranked,
    config: { board: { width: 8, height: 8 }, demo_label: label },
    initialState: [],
    startedAt,
  });
  store.appendTurn(id, {
    turn: 1,
    player: a.id,
    actions: [{ type: 'demo_move', description: 'Lượt mẫu để kiểm tra replay' }],
    events: [{ type: 'demo', message: label }],
    state: [],
  });
  return store.finishMatch(id, { winner_team: winner.id, reason: 'DEMO_RESULT' }, [], new Date().toISOString());
}

try {
  players.forEach(ensurePlayer);

  const casual = makeFinishedMatch({ a: players[0], b: players[1], mode: 'casual', label: 'DEMO • Chơi vui' });
  const ranked = makeFinishedMatch({ a: players[1], b: players[0], mode: 'ranked', ranked: true, winner: players[1], label: 'DEMO • Đua hạng' });

  const tournament = store.createTournament({
    gameId: 'rps_chess',
    code: `DEMO-${suffix.slice(-8)}`,
    name: `DEMO • Giải đấu lịch sử ${suffix}`,
    format: 'single_elimination',
    config: { organizerId: players[0].id, organizerName: players[0].display_name, maxParticipants: 4 },
  });
  players.forEach((player, index) => store.addTournamentEntry(tournament.id, { userId: player.id, seed: index + 1 }));
  let bracket = store.generateTournamentBracket(tournament.id);

  for (let roundNo = 1; roundNo <= bracket.rounds.length; roundNo += 1) {
    const round = bracket.rounds[roundNo - 1];
    for (const slot of round.matches) {
      if (slot.winner_id || !slot.participant_a_id || !slot.participant_b_id) continue;
      const a = players.find((player) => player.id === slot.participant_a_id);
      const b = players.find((player) => player.id === slot.participant_b_id);
      if (!a || !b) throw new Error(`Không xác định được người chơi ở vòng ${roundNo}, trận ${slot.slot_index}`);
      const winner = roundNo === 2 ? players[1] : a;
      const match = makeFinishedMatch({ a, b, mode: 'tournament', winner, label: `DEMO • Giải • Vòng ${roundNo}` });
      bracket = store.attachSlotResult(tournament.id, { roundNo, slotIndex: slot.slot_index, matchId: match.id });
    }
  }

  const complete = store.getTournament(tournament.id);
  const ids = [casual.id, ranked.id, ...complete.rounds.flatMap((round) => round.matches.map((match) => match.match_id)).filter(Boolean)];
  const report = {
    casual: store.getMatch(casual.id),
    ranked: store.getMatch(ranked.id),
    tournament: {
      id: complete.id,
      code: complete.code,
      name: complete.name,
      status: complete.status,
      rounds: complete.rounds.map((round) => ({
        round_no: round.round_no,
        status: round.status,
        matches: round.matches.map(({ match_id, participant_a_name, participant_b_name, winner_id }) => ({ match_id, participant_a_name, participant_b_name, winner_id })),
      })),
      champion: complete.champion,
    },
    rankings: store.getRankings().filter((row) => players.some((player) => player.id === row.team_id)),
    match_ids: ids,
  };
  if (complete.status !== 'completed' || !complete.champion || complete.rounds.length !== 2 || complete.rounds.some((round) => round.matches.some((match) => !match.match_id || !match.winner_id))) {
    throw new Error('Dữ liệu giải chưa có đủ kết quả các vòng hoặc nhà vô địch.');
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.close();
}
