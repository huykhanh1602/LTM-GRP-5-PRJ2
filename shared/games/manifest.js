// Game manifest contract dùng chung cho backend và frontend.
// Mỗi game chỉ cần một manifest.js trong games/<id>/manifest.js.

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MODES = new Set(['casual', 'ranked', 'tournament']);
const KINDS = new Set(['client', 'server']);
const FIELD_TYPES = new Set(['integer', 'number', 'boolean', 'string', 'enum']);

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function freezeDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeDeep);
    return Object.freeze(value);
  }
  if (isObject(value)) {
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  }
  return value;
}

export function defineGameManifest(input) {
  if (!isObject(input)) throw new TypeError('Game manifest phải là object.');

  const manifest = freezeDeep({
    version: 1,
    capabilities: [],
    ui: {},
    ...input,
    modes: [...(input.modes ?? [])],
    capabilities: [...(input.capabilities ?? [])],
    config: {
      ...(input.config ?? {}),
      fields: { ...(input.config?.fields ?? {}) },
    },
  });

  const errors = validateGameManifest(manifest);
  if (errors.length) {
    throw new TypeError(`Game manifest không hợp lệ: ${errors.join('; ')}`);
  }
  return manifest;
}

export function validateGameManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return ['manifest phải là object'];

  if (!ID_PATTERN.test(manifest.id ?? '')) {
    errors.push('id phải là slug chữ thường, ví dụ rps_chess');
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    errors.push('name không được rỗng');
  }
  if (!KINDS.has(manifest.kind)) errors.push('kind phải là client hoặc server');
  if (!Array.isArray(manifest.modes) || manifest.modes.length === 0) {
    errors.push('modes không được rỗng');
  }
  for (const mode of manifest.modes ?? []) {
    if (!MODES.has(mode)) errors.push(`mode không hợp lệ: ${mode}`);
  }
  if (!isObject(manifest.ui)) errors.push('ui phải là object');
  if (!isObject(manifest.config) || !isObject(manifest.config.fields)) {
    errors.push('config.fields phải là object');
  }

  for (const [key, field] of Object.entries(manifest.config?.fields ?? {})) {
    if (!ID_PATTERN.test(key)) errors.push(`config field không hợp lệ: ${key}`);
    if (!isObject(field)) {
      errors.push(`config.${key} phải là object`);
      continue;
    }
    if (!FIELD_TYPES.has(field.type)) errors.push(`config.${key}.type không hợp lệ`);
    if (!('default' in field)) errors.push(`config.${key}.default là bắt buộc`);

    if (field.type === 'integer' || field.type === 'number') {
      if (!Number.isFinite(field.default)) errors.push(`config.${key}.default phải là số`);
      if (field.min !== undefined && field.default < field.min) errors.push(`config.${key}.default nhỏ hơn min`);
      if (field.max !== undefined && field.default > field.max) errors.push(`config.${key}.default lớn hơn max`);
    }
    if (field.type === 'boolean' && typeof field.default !== 'boolean') {
      errors.push(`config.${key}.default phải là boolean`);
    }
    if (field.type === 'string' && typeof field.default !== 'string') {
      errors.push(`config.${key}.default phải là string`);
    }
    if (field.type === 'enum' && (!Array.isArray(field.values) || !field.values.includes(field.default))) {
      errors.push(`config.${key}.values/default không hợp lệ`);
    }
  }

  if (manifest.kind === 'server') {
    const engine = manifest.engine;
    if (!isObject(engine)) {
      errors.push('server game phải có engine');
    } else {
      if (!['python', 'process'].includes(engine.runtime)) {
        errors.push('engine.runtime phải là python hoặc process');
      }
      if (typeof engine.entry !== 'string' || !engine.entry.trim()) {
        errors.push('engine.entry không được rỗng');
      }
      if (typeof engine.cwd !== 'string') errors.push('engine.cwd phải là string');
      if (!Number.isInteger(engine.matchTimeoutMs) || engine.matchTimeoutMs <= 0) {
        errors.push('engine.matchTimeoutMs phải là số nguyên dương');
      }
      if (engine.protocol !== undefined && !['ndjson-v1', 'json-file'].includes(engine.protocol)) {
        errors.push('engine.protocol phải là ndjson-v1 hoặc json-file');
      }
      if (!isObject(engine.bot)) {
        errors.push('engine.bot phải là object');
      } else {
        if (!['python', 'javascript', 'cpp'].includes(engine.bot.language)) {
          errors.push('engine.bot.language không hỗ trợ');
        }
        if (typeof engine.bot.entrypoint !== 'string') {
          errors.push('engine.bot.entrypoint phải là string');
        }
        if (!Number.isInteger(engine.bot.maxBytes) || engine.bot.maxBytes <= 0) {
          errors.push('engine.bot.maxBytes phải là số nguyên dương');
        }
        if (engine.bot.filenamePattern !== undefined) {
          try {
            new RegExp(engine.bot.filenamePattern);
          } catch {
            errors.push('engine.bot.filenamePattern không hợp lệ');
          }
        }
      }
    }
    if (!isObject(manifest.replay)) {
      errors.push('replay phải là object');
    } else {
      if (!Number.isInteger(manifest.replay.schemaVersion) || manifest.replay.schemaVersion <= 0) {
        errors.push('replay.schemaVersion phải là số nguyên dương');
      }
      if (typeof manifest.replay.adapter !== 'string') {
        errors.push('replay.adapter phải là string');
      }
    }
  }

  if (manifest.config?.toEngineConfig !== undefined &&
      typeof manifest.config.toEngineConfig !== 'function') {
    errors.push('config.toEngineConfig phải là function');
  }

  return errors;
}
