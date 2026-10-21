// Port cho mọi engine runner.
// Infrastructure (Python, process, container...) implement port này.
// Application layer chỉ biết interface, không biết spawn hay file hệ thống.

export class EngineRunError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'EngineRunError';
    this.code = options.code ?? 'ENGINE_RUN_FAILED';
  }
}

export class EngineTimeoutError extends EngineRunError {
  constructor(message) {
    super(message, { code: 'ENGINE_TIMEOUT' });
    this.name = 'EngineTimeoutError';
  }
}

export class EngineProtocolError extends EngineRunError {
  constructor(message) {
    super(message, { code: 'ENGINE_PROTOCOL_ERROR' });
    this.name = 'EngineProtocolError';
  }
}

/**
 * @typedef {Object} BotSource
 * @property {string} userId
 * @property {string} displayName
 * @property {string} source
 * @property {string} filename
 */

/**
 * @typedef {Object} EngineRunInput
 * @property {string} gameId
 * @property {string} matchId
 * @property {object} manifest
 * @property {{ a: BotSource, b: BotSource }} bots
 * @property {Record<string, unknown>} config
 * @property {(event: object) => void} [onEvent]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} EngineRunResult
 * @property {string} gameId
 * @property {string} matchId
 * @property {object} replay          // raw replay của game, adapter sẽ map
 * @property {object[]} events        // match_start, turn, match_end
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {string} [diagnostics]
 */

/**
 * @typedef {Object} EngineRunner
 * @property {(input: EngineRunInput) => Promise<EngineRunResult>} run
 */

export const ENGINE_RUNNER = Symbol('EngineRunner');
