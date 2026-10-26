import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchStore } from '../net/storage/matchStore.js';
import { createHttpServer } from '../net/http.js';

test('game rankings are isolated by game and tournaments have their own table', t => {
  const store = createMatchStore({ filename: ':memory:' });
  t.after(() => store.close());
  const play = (id, gameId, winner) => {
    store.startMatch({ id, roomId: id, gameId, mode: 'ranked', ranked: true,
      teamA: { id: 'alpha', name: 'Alpha' }, teamB: { id: 'beta', name: 'Beta' }, initialState: [] });
    store.finishMatch(id, { winner }, []);
  };
  play('rps-match', 'rps_chess', 'alpha');
  play('snake-match', 'snake_battle', 'beta');
  assert.equal(store.getRankings({ gameId: 'rps_chess' }).find(row => row.team_id === 'alpha').points, 3);
  assert.equal(store.getRankings({ gameId: 'rps_chess' }).find(row => row.team_id === 'beta').played, 1);
  assert.equal(store.getRankings({ gameId: 'snake_battle' }).find(row => row.team_id === 'beta').points, 3);
  assert.equal(store.getRankings({ gameId: 'snake_battle' }).find(row => row.team_id === 'alpha').points, 0);

  const tournament = store.createTournament({ gameId: 'rps_chess', code: 'RANK-ONE', name: 'Rank One', format: 'single_elimination', config: { participantMode: 'TEAM' } });
  store.addTournamentEntry(tournament.id, { teamId: 'alpha', seed: 1 });
  store.addTournamentEntry(tournament.id, { teamId: 'beta', seed: 2 });
  const round = store.createTournamentRound(tournament.id, { roundNo: 1 });
  store.recordTournamentMatch({ tournamentId: tournament.id, roundId: round.id,
    participantAId: 'alpha', participantAName: 'Alpha', participantBId: 'beta', participantBName: 'Beta', winnerId: 'beta' });
  const tournamentRows = store.getTournamentRankings('RANK-ONE');
  assert.equal(tournamentRows[0].team_id, 'beta');
  assert.equal(tournamentRows[0].points, 3);
  assert.equal(store.getRankings({ gameId: 'rps_chess' }).find(row => row.team_id === 'alpha').points, 3,
    'a tournament result must not affect the game ladder');
});

test('HTTP exposes independent game and tournament leaderboards', async t => {
  const store = createMatchStore({ filename: ':memory:' });
  const server = createHttpServer({ matchStore: store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  store.startMatch({ id: 'game-one', roomId: 'game-one', gameId: 'rps_chess', mode: 'ranked', ranked: true,
    teamA: { id: 'alpha', name: 'Alpha' }, teamB: { id: 'beta', name: 'Beta' }, initialState: [] });
  store.finishMatch('game-one', { winner: 'alpha' }, []);
  const gameResponse = await fetch(`${base}/api/rankings?gameId=rps_chess`);
  assert.equal(gameResponse.status, 200);
  assert.equal((await gameResponse.json()).items[0].team_id, 'alpha');
  const badGame = await fetch(`${base}/api/rankings?gameId=unknown`);
  assert.equal(badGame.status, 404);

  const tournament = store.createTournament({ gameId: 'rps_chess', code: 'HTTP-RANK', name: 'HTTP Rank',
    format: 'single_elimination', config: { participantMode: 'TEAM' } });
  store.addTournamentEntry(tournament.id, { teamId: 'alpha' });
  store.addTournamentEntry(tournament.id, { teamId: 'beta' });
  const round = store.createTournamentRound(tournament.id, { roundNo: 1 });
  store.recordTournamentMatch({ tournamentId: tournament.id, roundId: round.id, participantAId: 'alpha',
    participantAName: 'Alpha', participantBId: 'beta', participantBName: 'Beta', winnerId: 'beta' });
  const tournamentResponse = await fetch(`${base}/api/tournaments/${tournament.id}/rankings`);
  assert.equal(tournamentResponse.status, 200);
  assert.equal((await tournamentResponse.json()).items[0].team_id, 'beta');
});
