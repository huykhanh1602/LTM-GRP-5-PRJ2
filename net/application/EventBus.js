// Event bus đơn giản cho net layer.
// Dùng để TournamentScheduler lắng nghe sự kiện MATCH_FINISHED.

export function createEventBus({ logger = console } = {}) {
  const listeners = new Map();

  function on(event, listener) {
    if (typeof event !== 'string' || !event) throw new TypeError('event must be a non-empty string');
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => { listeners.get(event)?.delete(listener); };
  }

  function emit(event, payload) {
    if (typeof event !== 'string' || !event) throw new TypeError('event must be a non-empty string');
    const group = listeners.get(event);
    if (!group) return 0;
    let count = 0;
    for (const listener of group) {
      try { listener(payload, event); count++; }
      catch (error) { logger.error?.({ event, error: error.message }); }
    }
    return count;
  }

  function clear() { listeners.clear(); }

  return { on, emit, clear };
}