// Chuẩn hóa và validate config do người chơi gửi lên theo manifest của game.

export class GameConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'GameConfigError';
    this.code = 'INVALID_GAME_CONFIG';
    Object.assign(this, details);
  }
}

export function resolveGameConfig(manifest, raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new GameConfigError('config phải là object', { gameId: manifest.id });
  }

  const resolved = {};
  for (const [key, field] of Object.entries(manifest.config.fields)) {
    resolved[key] = field.default;
  }

  for (const [key, value] of Object.entries(raw)) {
    const field = manifest.config.fields[key];
    if (!field) continue; // khóa lạ bị bỏ qua, giữ tương thích casual
    resolved[key] = validateField(manifest.id, key, field, value);
  }

  return resolved;
}

function validateField(gameId, key, field, value) {
  const fail = (reason) => {
    throw new GameConfigError(`${key}: ${reason}`, { gameId, key, value });
  };

  switch (field.type) {
    case 'integer':
      if (!Number.isInteger(value)) fail('phải là số nguyên');
      if (field.min !== undefined && value < field.min) fail(`nhỏ hơn ${field.min}`);
      if (field.max !== undefined && value > field.max) fail(`lớn hơn ${field.max}`);
      return value;

    case 'number':
      if (!Number.isFinite(value)) fail('phải là số');
      if (field.min !== undefined && value < field.min) fail(`nhỏ hơn ${field.min}`);
      if (field.max !== undefined && value > field.max) fail(`lớn hơn ${field.max}`);
      return value;

    case 'boolean':
      if (typeof value !== 'boolean') fail('phải là boolean');
      return value;

    case 'string':
      if (typeof value !== 'string') fail('phải là string');
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        fail(`dài hơn ${field.maxLength} ký tự`);
      }
      return value;

    case 'enum':
      if (!field.values.includes(value)) fail(`phải là một trong ${field.values.join(', ')}`);
      return value;

    default:
      fail('type không hỗ trợ');
  }
}

export function toEngineConfig(manifest, config) {
  const mapper = manifest.config.toEngineConfig;
  if (typeof mapper !== 'function') return { ...config };

  const mapped = mapper(config);
  if (mapped === null || typeof mapped !== 'object' || Array.isArray(mapped)) {
    throw new GameConfigError('config.toEngineConfig phải trả về object', {
      gameId: manifest.id,
    });
  }
  return mapped;
}
