import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMatchStore } from '../net/storage/matchStore.js';
import { createHttpServer } from '../net/http.js';
import { createOrchestrator } from '../net/orchestrator.js';

const teams = { teamA: { id: 'alpha', name: 'Alpha' }, teamB: { id: 'beta', name: 'Beta' } };
function start(store, id, extra = {}) {
  return store.startMatch({ id, roomId: 'room-01', ...teams, initialState: [], ...extra });
}

test('rankings count wins/draws exactly once and exclude practice/aborted matches', t => {
  const store = createMatchStore({ filename: ':memory:' });
  t.after(() => store.close());
  start(store, 'win');
  store.finishMatch('win', { winner: 'alpha', reason: 'BASE_CAPTURED' }, []);
  store.finishMatch('win', { winner: 'beta' }, []);
  start(store, 'draw'); store.finishMatch('draw', { draw: true }, []);
  start(store, 'practice', { ranked: false }); store.finishMatch('practice', { winner: 'beta' }, []);
  start(store, 'aborted'); store.finishMatch('aborted');
  start(store, 'running');
  const [a, b] = store.getRankings();
  assert.deepEqual([a.team_id, a.played, a.wins, a.draws, a.losses, a.points], ['alpha', 2, 1, 1, 0, 4]);
  assert.deepEqual([b.team_id, b.played, b.wins, b.draws, b.losses, b.points], ['beta', 2, 0, 1, 1, 1]);
});

test('replay persists across reopening, invalid writes roll back, turns remain ordered', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ltm-storage-'));
  let store = createMatchStore({ filename: join(dir, 'game.sqlite') });
  t.after(() => { store.close(); rmSync(dir, { recursive: true }); });
  start(store, 'match');
  store.appendTurn('match', { turn: 1, player: 'alpha', actions: [{ from: [0, 0], to: [1, 0] }], state: [{ id: 'A1' }] });
  assert.throws(() => store.appendTurn('match', { turn: 1 }), /increase/);
  assert.throws(() => store.appendTurn('match', { turn: 2, player: 'unknown' }), /participant/);
  assert.throws(() => store.finishMatch('match', { winner: 'unknown' }), /participant/);
  assert.equal(store.getMatch('match').status, 'playing');
  assert.throws(() => start(store, 'bad', { teamB: { id: '  alpha  ' } }));
  assert.equal(store.listMatches().total, 1);
  store.finishMatch('match', { winner_team: 'alpha' }, [{ id: 'A1' }]);
  assert.throws(() => store.appendTurn('match', { turn: 2 }), /closed/);
  store.close(); store = createMatchStore({ filename: join(dir, 'game.sqlite') });
  assert.equal(store.getReplay('match').turns.length, 1);
  assert.deepEqual(store.getMatch('match').final_state, [{ id: 'A1' }]);
  assert.equal(store.getRankings()[0].points, 3);
});

test('restart aborts unfinished matches without ranking points', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  start(store, 'interrupted');
  assert.equal(store.abortInterruptedMatches(), 1);
  assert.equal(store.abortInterruptedMatches(), 0);
  assert.equal(store.getMatch('interrupted').reason, 'SERVER_RESTART');
  assert.ok(store.getRankings().every(row => row.points === 0));
});

test('finishing without a new snapshot retains the last accepted board state', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  start(store, 'snapshot');
  store.appendTurn('snapshot', { turn: 1, state: [{ id: 'A1', pos: [1, 0] }] });
  store.finishMatch('snapshot', { winner: 'alpha' });
  assert.deepEqual(store.getMatch('snapshot').final_state, [{ id: 'A1', pos: [1, 0] }]);
});

test('orchestrator saves accepted turns and results with stable team IDs', async t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  const bots = [{ team: 'B', teamId: 'beta', teamName: 'Beta' }, { team: 'A', teamId: 'alpha', teamName: 'Alpha' }];
  const messages = [];
  const orchestrator = createOrchestrator({ listBots: () => bots }, { broadcastToRoom: (_, m) => { messages.push(m); return 1; } }, store);
  assert.equal((await orchestrator.startRoom('room', [])).ok, true);
  await orchestrator.updateRoomState('room', ['moved'], 'B', { turn: 1, player: 'alpha' });
  assert.equal(await orchestrator.stopRoom('room', { winner: 'alpha' }), true);
  assert.equal(await orchestrator.stopRoom('room', { winner: 'beta' }), false);
  const id = store.listMatches().items[0].id;
  assert.equal(store.getMatch(id).team_a_id, 'alpha');
  assert.equal(messages.at(-1).matchId, id);
  assert.equal(store.getReplay(id).turns.length, 1);
  assert.equal(store.getRankings()[0].points, 3);
  assert.equal(messages.at(-1).type, 'game_over');
});

test('games, tournaments and bot submission versions persist with validated state transitions', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  assert.equal(store.listGames()[0].id, 'rps_chess');
  const tournament = store.createTournament({ gameId: 'rps_chess', code: 'LTM-2026',
    name: 'Autumn Cup', format: 'single_elimination', config: { maxTeams: 8 } });
  assert.equal(tournament.status, 'draft');
  store.createTournamentRound(tournament.id, { roundNo: 1 });
  assert.equal(store.listTournaments().items[0].participant_count, 0);
  assert.equal(store.getTournament('LTM-2026').rounds.length, 1);
  store.updateTournamentStatus(tournament.id, 'open');
  assert.throws(() => store.updateTournamentStatus(tournament.id, 'completed'), /not allowed/);

  store.registerTeam({ id: 'room:team_a', name: 'Alpha' });
  const first = store.saveBotSubmission({ roomId: 'ROOM', teamId: 'room:team_a', filename: 'bot.py', source: 'print(1)' });
  const second = store.saveBotSubmission({ roomId: 'ROOM', teamId: 'room:team_a', filename: 'bot.py', source: 'print(2)' });
  assert.notEqual(first.source_sha256, second.source_sha256);
  assert.equal(store.listBotSubmissions({ roomId: 'ROOM', teamId: 'room:team_a' }).total, 2);
  assert.equal(store.getBotSubmission(first.id, 'ROOM', 'room:team_a').source, 'print(1)');
  assert.throws(() => store.getBotSubmission(first.id, 'ROOM', 'other-team'), /not found/);
});

test('teams with identical results share rank; draws must be explicit', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  start(store, 'draw'); store.finishMatch('draw', { draw: true });
  assert.deepEqual(store.getRankings().map(row => [row.rank, row.points]), [[1, 1], [1, 1]]);
  start(store, 'conflict');
  assert.throws(() => store.finishMatch('conflict', { winner: 'alpha', draw: true }), /Draw/);
  store.finishMatch('conflict', { reason: 'CANCELLED' });
  assert.equal(store.getMatch('conflict').status, 'aborted');
  assert.ok(store.getRankings().every(row => row.played === 1));
});

test('HTTP APIs support pagination, filters, replay, errors and reject public writes', async t => {
  const store = createMatchStore({ filename: ':memory:' });
  start(store, 'api'); store.finishMatch('api', { winner: 'alpha' }, []);
  const server = createHttpServer({ matchStore: store, authenticate: async request =>
    request.headers.authorization === 'Bearer test-organizer'
      ? { user: { id: 'organizer-1', role: 'organizer' } } : null });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const rankings = await (await fetch(`${base}/api/rankings`)).json();
  assert.equal(rankings.items[0].points, 3);
  assert.deepEqual(await (await fetch(`${base}/api/me`)).json(), { authenticated: false, user: null });
  assert.equal((await (await fetch(`${base}/api/games`)).json()).items[0].id, 'rps_chess');
  assert.equal((await (await fetch(`${base}/api/tournaments`)).json()).total, 0);
  assert.equal((await fetch(`${base}/api/tournaments`, { method: 'POST', body: '{}' })).status, 401);
  const createdResponse = await fetch(`${base}/api/tournaments`, {
    method: 'POST', headers: { Authorization: 'Bearer test-organizer', 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: 'rps_chess', code: 'TEST-26', name: 'Test cup', format: 'swiss' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal((await (await fetch(`${base}/api/tournaments/TEST-26`)).json()).id, created.id);
  const list = await (await fetch(`${base}/api/matches?teamId=alpha&status=finished&limit=1`)).json();
  assert.equal(list.total, 1); assert.equal(list.items.length, 1);
  const replay = await (await fetch(`${base}/api/matches/api/replay`)).json();
  assert.equal(replay.match_info.winner, 'team_a');
  for (const path of ['/api/matches/missing', '/api/unknown']) assert.equal((await fetch(base + path)).status, 404);
  for (const query of ['limit=0', 'limit=abc', 'offset=-1', 'status=bad', 'limit=']) {
    assert.equal((await fetch(`${base}/api/matches?${query}`)).status, 400);
  }
  assert.equal((await fetch(`${base}/api/matches/%FF`)).status, 400);
  assert.equal((await fetch(`${base}/api/rankings`, { method: 'POST' })).status, 405);
});
