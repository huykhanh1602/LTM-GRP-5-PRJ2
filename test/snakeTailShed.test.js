import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildFrames, describeEvent, REASON_LABELS } from '../src/utils/replayEngine.js';
import { humanMoveTargets } from '../src/utils/humanMoves.js';
import { fallbackAction } from '../net/humanTurn.js';

const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');

function playMatch(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'snake-shed-'));
  const config = JSON.parse(readFileSync('engine/snake/config.json', 'utf8'));
  config.seed = seed;
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  const out = join(dir, 'replay.json');
  const result = spawnSync(python, [
    'engine/snake/match_runner.py',
    '--bot-a', 'engine/snake/bot_sample_greedy.py',
    '--bot-b', 'engine/snake/bot_sample_greedy.py',
    '--config', join(dir, 'config.json'),
    '--out', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(readFileSync(out, 'utf8'));
}

test('giao diện dựng đúng đuôi rụng từ một trận thật: có quân OBSTACLE và mô tả sự kiện', () => {
  const replay = playMatch(3);
  const shedEvents = replay.turns.flatMap((t) => t.events).filter((e) => e.type === 'TAIL_SHED');
  assert.ok(shedEvents.length > 0, 'bot tham lam ăn mồi nên phải có lần rụng đuôi');
  const frames = buildFrames(replay);
  const last = frames.at(-1);
  const obstacles = Object.values(last.pieces).filter((p) => p.type === 'OBSTACLE');
  assert.equal(obstacles.length, shedEvents.reduce((sum, e) => sum + e.cells.length, 0));
  assert.ok(obstacles.every((p) => p.source === 'team_a' || p.source === 'team_b'));
  const text = describeEvent(shedEvents[0], replay).text;
  assert.match(text, /rụng 2 đốt đuôi/);
});

test('mô tả va chạm và lý do thua khi đâm đuôi đã rụng', () => {
  const replay = { match_info: { teams: { team_a: 'A', team_b: 'B' } } };
  const text = describeEvent({ type: 'SNAKE_CRASH', team: 'team_a', reason: 'HIT_OBSTACLE', pos: [1, 2] }, replay).text;
  assert.match(text, /vào đuôi đã rụng/);
  assert.ok(REASON_LABELS.SNAKE_HIT_OBSTACLE);
});

const payload = (obstacles) => ({
  board_state: { width: 6, height: 6, turn: 3, obstacles },
  my_pieces: [
    { id: 'SEG_0', type: 'HEAD', pos: [2, 2] },
    { id: 'SEG_1', type: 'BODY', pos: [2, 3] },
    { id: 'SEG_2', type: 'BODY', pos: [2, 4] },
  ],
  opponent_pieces: [],
  config: {},
});

test('người chơi bằng chuột: không tô ô có đuôi đã rụng', () => {
  const dirs = (obs) => humanMoveTargets('snake_battle', payload(obs)).map((t) => t.action.direction).sort();
  assert.deepEqual(dirs([]), ['LEFT', 'RIGHT', 'UP']);
  assert.deepEqual(dirs([[3, 2], [2, 1]]), ['LEFT']);
});

test('nước đi dự phòng khi người chơi hết giờ không đâm vào đuôi đã rụng', () => {
  const action = fallbackAction('snake_battle', payload([[1, 2], [2, 1]]));
  assert.equal(action.direction, 'RIGHT');
});
