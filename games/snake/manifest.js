import { defineGameManifest } from '../../shared/games/manifest.js';

export const manifest = defineGameManifest({
  id: 'snake_battle',
  name: 'Rắn Săn Mồi (Snake Bot)',
  kind: 'server',
  modes: ['casual', 'ranked', 'tournament'],
  capabilities: ['ranked', 'tournament', 'spectator'],
  ui: {
    cover: '/game/kbb_game.png',
    icon: '/logo/kbb_logo.webp',
    categories: ['chien_thuat', 'tri_tue', '2_nguoi'],
  },
  config: {
    fields: {
      max_turns: { type: 'integer', min: 20, max: 500, default: 200 },
      bot_time_ms: { type: 'integer', min: 100, max: 5000, default: 1000 },
      food_count: { type: 'integer', min: 1, max: 20, default: 5 },
    },
    toEngineConfig: (config) => ({ limits: config }),
  },
  engine: {
    runtime: 'python',
    cwd: '.',
    entry: 'engine/snake/match_runner.py',
    configTemplate: 'engine/snake/config.json',
    protocol: 'ndjson-v1',
    matchTimeoutMs: 120_000,
    bot: {
      language: 'python',
      entrypoint: 'make_move',
      maxBytes: 100 * 1024,
      filenamePattern: '^[A-Za-z0-9_-]{1,50}\\.py$',
    },
  },
  replay: {
    schemaVersion: 1,
    adapter: 'snake-v1',
  },
});
