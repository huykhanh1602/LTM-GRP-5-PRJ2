import { defineGameManifest } from '../../shared/games/manifest.js';

// Nguồn sự thật duy nhất cho game RPS.
// Backend dùng engine/config, frontend dùng ui/viewer.
export const manifest = defineGameManifest({
  id: 'rps_chess',
  name: 'Kéo · Búa · Bao',
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
      max_turns: { type: 'integer', min: 1, max: 300, default: 100 },
      bot_time_ms: { type: 'integer', min: 100, max: 5000, default: 1000 },
    },
    toEngineConfig: (config) => ({ limits: config }),
  },
  engine: {
    runtime: 'python',
    cwd: '.',
    entry: 'engine/match_runner.py',
    configTemplate: 'engine/config.json',
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
    adapter: 'rps-v1',
  },
});
