// Logic THUẦN của game mẫu Tap Counter.
// Không import React, không đụng DOM -> có thể kiểm thử bằng node --test.
// Đây là ví dụ về việc tách Business Logic khỏi Render UI (xem plan mục 3.1).

export const TAP_COUNTER_DEFAULTS = Object.freeze({
    durationMs: 20000,
});

export function createGameState(options = {}) {
    return {
        durationMs: options.durationMs ?? TAP_COUNTER_DEFAULTS.durationMs,
        taps: 0,
        startedAt: 0,
        endedAt: null,
    };
}

export function begin(state, now = Date.now()) {
    return { ...state, taps: 0, startedAt: now, endedAt: null };
}

export function registerTap(state) {
    // Chỉ chặn khi ván đã kết thúc TƯỜNG MINH.
    // Việc hết giờ theo đồng hồ do isFinished/syncClock đảm nhiệm.
    if (state.endedAt != null) return state;
    return { ...state, taps: state.taps + 1 };
}

export function isFinished(state, now = Date.now()) {
    if (state.endedAt != null) return true;
    if (!state.startedAt) return false;
    return now - state.startedAt >= state.durationMs;
}

export function finish(state, now = Date.now()) {
    if (state.endedAt != null) return state;
    return { ...state, endedAt: now };
}

export function remainingMs(state, now = Date.now()) {
    if (!state.startedAt) return state.durationMs;
    return Math.max(0, state.startedAt + state.durationMs - now);
}

export function scoreOf(state) {
    return state.taps;
}

export function playtimeOf(state, now = Date.now()) {
    if (!state.startedAt) return 0;
    return (state.endedAt ?? now) - state.startedAt;
}
