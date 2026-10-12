import { createMatchStore } from '../net/storage/matchStore.js';

// Clearly labeled, unranked examples. Re-running never overwrites existing records.
const store = createMatchStore();
const a = '[Ví dụ] Hoàng Định', b = '[Ví dụ] Huy Khánh', c = '[Ví dụ] LTM 5';
const examples = [
  { id: 'EXAMPLE_REPLAY_A_WIN', names: [a, b], winner: 'team_a', reason: 'BASE_CAPTURED',
    moves: [['team_a', 'A1', [0, 0], [1, 1]], ['team_b', 'B1', [2, 0], [1, 0]], ['team_a', 'A1', [1, 1], [2, 2]]] },
  { id: 'EXAMPLE_REPLAY_B_WIN', names: [a, c], winner: 'team_b', reason: 'BASE_CAPTURED',
    moves: [['team_b', 'B1', [2, 0], [1, 1]], ['team_a', 'A1', [0, 0], [1, 0]], ['team_b', 'B1', [1, 1], [0, 2]]] },
  { id: 'EXAMPLE_REPLAY_DRAW', names: [a, b], winner: null, reason: 'DRAW',
    moves: [['team_a', 'A1', [0, 0], [1, 0]], ['team_b', 'B1', [2, 0], [2, 1]]] },
];
try {
  const now = Date.now();
  for (const [index, example] of examples.entries()) {
    try { store.getMatch(example.id); console.log(`Already saved: ${example.id}`); continue; }
    catch (error) { if (error.code !== 'MATCH_NOT_FOUND') throw error; }
    const turns = example.moves.map(([player, piece_id, from, to], index) => ({
      turn: index + 1, player,
      actions: [{ piece_id, action_type: 'MOVE', from, to }],
      events: [{ type: 'PIECE_MOVED', piece_id, from, to }],
    }));
    if (example.winner) turns.at(-1).events.push({ type: 'BASE_CAPTURED', team_id: example.winner, location: example.moves.at(-1)[3] });
    turns.at(-1).events.push({ type: 'GAME_OVER', winner_team: example.winner, reason: example.reason });
    const replay = {
      match_info: { match_id: example.id, teams: { team_a: example.names[0], team_b: example.names[1] },
        winner: example.winner, win_reason: example.reason },
      game_config: { board: { width: 3, height: 3, special_tiles: [
        { pos: [0, 2], type: 'BASE', owner: 'team_a' }, { pos: [2, 2], type: 'BASE', owner: 'team_b' },
      ] }, limits: { max_turns: turns.length, starting_team: example.moves[0][0] } },
      initial_state: [
        { id: 'A1', owner: 'team_a', type: 'ROCK', pos: [0, 0], hp: 1 },
        { id: 'B1', owner: 'team_b', type: 'PAPER', pos: [2, 0], hp: 1 },
      ], turns,
    };
    const startedAt = new Date(now - (index + 1) * 3600000).toISOString();
    const endedAt = new Date(Date.parse(startedAt) + 120000).toISOString();
    store.importReplay(replay, { ranked: false, roomId: 'example-room', startedAt, endedAt });
    console.log(`Saved ${example.id}: ${example.names.join(' vs ')}; ${startedAt}; ${example.winner ?? 'DRAW'}`);
  }
} finally { store.close(); }
