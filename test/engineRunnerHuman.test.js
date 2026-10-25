import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runEngineMatch } from '../net/engineRunner.js';

const BOT = readFileSync('engine/snake/bot_sample_random.py', 'utf8');

test('engineRunner trả lượt cho người thật và nhận nước đi qua stdin', async () => {
  const asked = [];
  const types = [];
  const replay = await runEngineMatch({
    roomCode: 'HUMN',
    gameId: 'snake_battle',
    humanTurnMs: 3000,
    teamA: {
      name: 'Người chơi A',
      control: 'human',
      onTurn: (payload, info) => {
        asked.push({ team: info.team, width: payload.board_state.width, head: payload.my_pieces[0].pos });
        return fallbackAction('snake_battle', payload);
      },
    },
    teamB: { name: 'Bot B', code: BOT, control: 'bot' },
    configPatch: { limits: { max_turns: 8 } },
    onEvent: (event) => {
      if (event.type === 'turn') types.push(...event.turn.events.map((item) => item.type));
    },
  });

  assert.deepEqual(types.filter((type) => type === 'BOT_FAILED'), [], 'luot nguoi khong duoc lam hong bot');

  assert.ok(asked.length >= 3, `engine phải hỏi nhiều lượt, thực nhận ${asked.length}`);
  assert.deepEqual(asked.map((item) => item.team), Array(asked.length).fill('team_a'));
  assert.deepEqual(replay.controls, { team_a: 'human', team_b: 'bot' });
  assert.equal(replay.game_config.limits.max_turns, 8);
  const humanTurns = replay.turns.filter((turn) => turn.player === 'team_a');
  assert.ok(humanTurns.length > 0 && humanTurns.every((turn) => turn.actions.length > 0));
  assert.notEqual(replay.match_info.win_reason, 'ILLEGAL_MOVE');
});

test('người chơi im lặng thì máy tự đi nước an toàn khi hết giờ', async () => {
  let requests = 0;
  const replay = await runEngineMatch({
    roomCode: 'HUSH',
    gameId: 'snake_battle',
    humanTurnMs: 300,
    teamA: { name: 'Người chơi A', control: 'human', onTurn: () => new Promise(() => {}) },
    teamB: { name: 'Bot B', code: BOT, control: 'bot' },
    configPatch: { limits: { max_turns: 6 } },
    onEvent: (event) => {
      if (event.type === 'turn' && event.turn.player === 'team_a') requests += 1;
    },
  });

  assert.ok(requests >= 2, 'các lượt im lặng vẫn phải được đi tiếp');
  assert.equal(replay.match_info.win_reason === 'BOT_TIMEOUT', false);
});
