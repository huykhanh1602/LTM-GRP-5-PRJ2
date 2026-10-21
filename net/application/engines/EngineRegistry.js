import { validateGameManifest } from '../../../shared/games/manifest.js';
import { resolveGameConfig } from '../../../shared/games/resolveConfig.js';

export class UnknownGameError extends Error {
  constructor(gameId) {
    super(`Game chưa đăng ký: ${gameId}`);
    this.name = 'UnknownGameError';
    this.code = 'UNKNOWN_GAME';
    this.gameId = gameId;
  }
}

export class DuplicateGameError extends Error {
  constructor(gameId) {
    super(`Game đã đăng ký: ${gameId}`);
    this.name = 'DuplicateGameError';
    this.code = 'DUPLICATE_GAME';
    this.gameId = gameId;
  }
}

export function createEngineRegistry({ logger = console } = {}) {
  const manifests = new Map();

  function register(manifest) {
    const errors = validateGameManifest(manifest);
    if (errors.length) {
      throw new TypeError(`Game manifest không hợp lệ: ${errors.join('; ')}`);
    }
    if (manifests.has(manifest.id)) throw new DuplicateGameError(manifest.id);

    manifests.set(manifest.id, manifest);
    logger.info?.({ event: 'game_registered', gameId: manifest.id });
    return manifest;
  }

  function registerAll(list) {
    if (!Array.isArray(list)) throw new TypeError('registerAll cần một array manifest');
    return list.map(register);
  }

  function get(gameId) {
    const manifest = manifests.get(gameId);
    if (!manifest) throw new UnknownGameError(gameId);
    return manifest;
  }

  function has(gameId) {
    return manifests.has(gameId);
  }

  function list() {
    return [...manifests.values()];
  }

  // Chỉ trả metadata an toàn cho API công khai, không lộ đường dẫn engine.
  function publicList() {
    return list().map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      kind: manifest.kind,
      version: manifest.version,
      modes: manifest.modes,
      capabilities: manifest.capabilities,
      ui: manifest.ui,
    }));
  }

  function resolveConfig(gameId, raw) {
    return resolveGameConfig(get(gameId), raw);
  }

  return { register, registerAll, get, has, list, publicList, resolveConfig };
}
