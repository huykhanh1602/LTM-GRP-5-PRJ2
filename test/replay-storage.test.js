import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatchStore } from '../net/storage/matchStore.js';
import { parseReplay } from '../src/utils/parseReplay.js';
import { buildFrames } from '../src/utils/replayEngine.js';

const sample = JSON.parse(readFileSync(new URL('../replay.json', import.meta.url), 'utf8'));

test('Python replay imports atomically and round-trips through the real frontend renderer', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  const match = store.importReplay(sample, { teamAId: 'alpha', teamBId: 'beta' });
  const expectedWinnerId = sample.match_info.winner === 'team_a' ? 'alpha' : 'beta';
  const expectedWinner = sample.match_info.winner;
  assert.equal(match.winner_id, expectedWinnerId);
  assert.deepEqual(match.final_state.find(piece => piece.id === 'A1').pos, buildFrames(sample).at(-1).pieces.A1.pos);
  const expectedFinalPieces = Object.values(buildFrames(sample).at(-1).pieces)
    .filter(piece => piece.alive).map(({ alive, ...piece }) => piece);
  assert.deepEqual(match.final_state, expectedFinalPieces);
  assert.equal(store.getRankings().find(row => row.team_id === expectedWinnerId).points, 3);
  const replay = parseReplay(store.getReplay(match.id));
  assert.deepEqual(replay.match_info.teams, sample.match_info.teams);
  assert.equal(replay.match_info.winner, expectedWinner);
  assert.equal(replay.turns.length, sample.turns.length);
  const frames = buildFrames(replay);
  assert.equal(frames.at(-1).over.winner, expectedWinner);
  assert.throws(() => store.importReplay(sample), /already exists/);
  assert.equal(store.getRankings().find(row => row.team_id === expectedWinnerId).points, 3);
});

test('a malformed imported turn rolls back all teams, match and turns', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  const replay = structuredClone(sample);
  replay.turns.at(-1).turn = replay.turns[0].turn;
  assert.throws(() => store.importReplay(replay), /increase/);
  assert.equal(store.listMatches().total, 0);
  assert.equal(store.getRankings().length, 0);
});

test('conflicting replay results cannot display a different winner from the ranking', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  const replay = structuredClone(sample);
  replay.match_info.winner = sample.match_info.winner === 'team_a' ? 'team_b' : 'team_a';
  assert.throws(() => store.importReplay(replay), /disagrees/);
  assert.equal(store.listMatches().total, 0);
});

test('draws and practice imports render correctly and only ranked matches affect points', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  const replay = structuredClone(sample);
  replay.match_info.match_id = 'draw';
  replay.match_info.winner = null;
  replay.match_info.win_reason = 'DRAW';
  replay.turns = [];
  store.importReplay(replay);
  const frames = buildFrames(parseReplay(store.getReplay('draw')));
  assert.equal(frames.at(-1).over.winner, null);
  assert.equal(frames.at(-1).over.reason, 'DRAW');
  assert.ok(store.getRankings().every(team => team.points === 1));
  store.importReplay(sample, { ranked: false });
  assert.ok(store.getRankings().every(team => team.points === 1 && team.played === 1));
});

test('stable team IDs normalize owners, player and winner for renderer', t => {
  const store = createMatchStore({ filename: ':memory:' }); t.after(() => store.close());
  store.startMatch({ id: 'live', roomId: 'room', teamA: { id: 'alpha', name: 'Alpha' },
    teamB: { id: 'beta', name: 'Beta' }, config: { board: { width: 8, height: 8 } },
    initialState: [{ id: 'A1', owner: 'alpha', type: 'ROCK', pos: [0, 0] }] });
  store.appendTurn('live', { turn: 1, player: 'alpha', events: [{ type: 'GAME_OVER', winner_team: 'alpha', reason: 'BASE_CAPTURED' }] });
  store.finishMatch('live', { winner: 'alpha', reason: 'BASE_CAPTURED' });
  const replay = parseReplay(store.getReplay('live'));
  assert.equal(replay.initial_state[0].owner, 'team_a');
  assert.equal(replay.turns[0].player, 'team_a');
  assert.equal(buildFrames(replay).at(-1).over.winner, 'team_a');
});
