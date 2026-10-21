import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEngineRegistry,
  DuplicateGameError,
  UnknownGameError,
} from '../../net/application/engines/EngineRegistry.js';
import { manifest as rpsManifest } from '../../games/rps-chess/manifest.js';

test('đăng ký, đọc manifest và resolve config theo schema', () => {
  const registry = createEngineRegistry({ logger: { info() {} } });
  registry.register(rpsManifest);

  assert.equal(registry.has('rps_chess'), true);
  assert.equal(registry.get('rps_chess').name, 'Kéo · Búa · Bao Cờ');
  assert.deepEqual(
    registry.resolveConfig('rps_chess', { max_turns: 50 }),
    { max_turns: 50, bot_time_ms: 1000 },
  );
  assert.equal(registry.publicList()[0].id, 'rps_chess');
  assert.throws(
    () => registry.resolveConfig('rps_chess', { max_turns: 0 }),
    /max_turns/,
  );
});

test('chặn đăng ký trùng và game chưa tồn tại', () => {
  const registry = createEngineRegistry({ logger: { info() {} } });
  registry.register(rpsManifest);

  assert.throws(() => registry.register(rpsManifest), DuplicateGameError);
  assert.throws(() => registry.get('missing_game'), UnknownGameError);
});
