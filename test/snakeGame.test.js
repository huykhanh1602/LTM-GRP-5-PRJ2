import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildFrames } from '../src/utils/replayEngine.js';
import { manifest } from '../games/snake/manifest.js';
import { GAME_MANIFESTS } from '../games/index.js';

const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');

function playMatch(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'snake-test-'));
  const config = JSON.parse(readFileSync('engine/snake/config.json', 'utf8'));
  config.seed = seed;
  config.limits.max_turns = 60;
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  const out = join(dir, 'replay.json');
  const result = spawnSync(python, [
    'engine/snake/match_runner.py',
    '--bot-a', 'engine/snake/bot_sample_greedy.py',
    '--bot-b', 'engine/snake/bot_sample_random.py',
    '--config', join(dir, 'config.json'),
    '--out', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(readFileSync(out, 'utf8'));
}

test('manifest snake_battle được đăng ký cùng rps_chess', () => {
  assert.equal(manifest.id, 'snake_battle');
  assert.deepEqual(GAME_MANIFESTS.map((m) => m.id), ['rps_chess', 'snake_battle']);
});

test('giao diện dựng lại đúng bàn cờ rắn từ replay: mồi và thân khớp từng lượt', () => {
  const replay = playMatch(11);
  const frames = buildFrames(replay);
  assert.ok(frames.length > replay.turns.length);

  const last = frames.at(-1);
  const lastTurn = replay.turns.at(-1);
  const snapshot = lastTurn.events.find((e) => e.type === 'SNAKE_STATE');
  const live = Object.values(last.pieces).map((p) => `${p.id}@${p.pos}`).sort();
  assert.deepEqual(live, snapshot.pieces.map((p) => `${p.id}@${p.pos}`).sort());
  assert.deepEqual(last.scores, replay.match_info.final_scores);

  // Mồi không bao giờ bị thiếu: luôn đủ food_count trên bàn.
  for (const frame of frames.slice(1)) {
    assert.equal(Object.values(frame.pieces).filter((p) => p.type === 'FOOD').length, 5);
  }
});

test('cùng seed cho cùng vị trí mồi ban đầu (bot ngẫu nhiên có thể đi khác nhau)', () => {
  const a = playMatch(5);
  const b = playMatch(5);
  assert.deepEqual(a.initial_state, b.initial_state);
  assert.equal(a.game_config.seed, 5);
});

test('khởi động bot (spawn + import) không bị tính vào đồng hồ lượt 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snake-boot-'));
  const slowBot = join(dir, 'slow_bot.py');
  // Bot nạp chậm 600ms ở đầu file, gấp 3 lần hạn mức mỗi lượt của trận đấu.
  writeFileSync(slowBot, 'import time\ntime.sleep(0.6)\n\n'
    + 'def make_move(board_state, my_pieces, opponent_pieces, config):\n'
    + '    return {"action_type": "MOVE", "direction": "RIGHT"}\n');

  const config = JSON.parse(readFileSync('engine/snake/config.json', 'utf8'));
  config.seed = 3;
  config.limits.max_turns = 8;
  config.limits.bot_time_ms = 200;
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config));

  const out = join(dir, 'replay.json');
  const result = spawnSync(python, [
    'engine/snake/match_runner.py',
    '--bot-a', slowBot,
    '--bot-b', 'engine/snake/bot_sample_random.py',
    '--config', configPath,
    '--out', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const replay = JSON.parse(readFileSync(out, 'utf8'));
  const failed = replay.turns.filter((t) => t.events.some((e) => e.type === 'BOT_FAILED'));
  assert.deepEqual(failed.map((t) => [t.turn, t.player]), [], 'lượt 1 không được phép hết giờ vì khởi động');
  assert.notEqual(replay.match_info.win_reason, 'BOT_TIMEOUT');
  assert.ok(replay.turns.length >= 2);
});
