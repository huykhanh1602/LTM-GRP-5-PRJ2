import { defineGameManifest } from '../../shared/games/manifest.js';

export const manifest = defineGameManifest({
  id: 'pikachu',
  name: 'Pikachu Puzzle',
  kind: 'client',
  modes: ['casual'],
  capabilities: [],
  ui: {
    cover: '/game/pikachu_game.png',
    icon: '/category-pikachu-3d.png',
    categories: ['giai_tri', 'tri_tue', 'game_vui', 'kinh_dien'],
  },
  config: {
    fields: {
      grid_size: { type: 'integer', min: 4, max: 20, default: 12 },
    },
    toEngineConfig: (config) => ({ gridSize: config.grid_size }),
  },
});