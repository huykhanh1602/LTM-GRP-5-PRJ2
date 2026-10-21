import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createPythonEngineRunner } from '../../net/infrastructure/engines/PythonEngineRunner.js';
import { manifest } from '../../games/rps-chess/manifest.js';

test('PythonEngineRunner chạy engine thật và trả replay đúng contract', async () => {
  const [botA, botB] = await Promise.all(
    ['bot_sample_1.py', 'bot_sample_2.py'].map((name) =>
      readFile(new URL(`../../engine/${name}`, import.meta.url), 'utf8'),
    ),
  );

  const runner = createPythonEngineRunner({ projectRoot: process.cwd() });
  const events = [];

  const result = await runner.run({
    gameId: 'rps_chess',
    matchId: 'M-TEST-RUNNER',
    manifest,
    bots: {
      a: {
        userId: 'u1',
        displayName: 'Alpha',
        source: botA,
        filename: 'bot_sample_1.py',
      },
      b: {
        userId: 'u2',
        displayName: 'Beta',
        source: botB,
        filename: 'bot_sample_2.py',
      },
    },
    config: { max_turns: 30, bot_time_ms: 1000 },
    onEvent: (event) => events.push(event.type),
  });

  assert.equal(result.gameId, 'rps_chess');
  assert.equal(result.replay.match_info.match_id, 'M-TEST-RUNNER');
  assert.ok(events.includes('match_start'));
  assert.ok(events.includes('match_end'));
  assert.ok(Array.isArray(result.replay.turns));
});
