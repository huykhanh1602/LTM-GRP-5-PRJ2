import { test } from "node:test";
import assert from "node:assert/strict";
import {
    TAP_COUNTER_DEFAULTS,
    begin,
    createGameState,
    finish,
    isFinished,
    playtimeOf,
    registerTap,
    remainingMs,
    scoreOf,
} from "../../src/games/_template/logic.js";

test("createGameState dùng thời lượng mặc định", () => {
    const state = createGameState();
    assert.equal(state.durationMs, TAP_COUNTER_DEFAULTS.durationMs);
    assert.equal(state.taps, 0);
    assert.equal(state.endedAt, null);
});

test("registerTap tăng điểm", () => {
    let state = begin(createGameState(), 1000);
    state = registerTap(state);
    state = registerTap(state);
    assert.equal(scoreOf(state), 2);
});

test("isFinished sai trước khi bắt đầu và đúng sau khi hết giờ", () => {
    const fresh = createGameState();
    assert.equal(isFinished(fresh, 9999), false);

    const started = begin(fresh, 1000);
    assert.equal(isFinished(started, 5000), false);
    assert.equal(isFinished(started, 1000 + TAP_COUNTER_DEFAULTS.durationMs), true);
});

test("registerTap không tăng điểm sau khi đã kết thúc", () => {
    let state = begin(createGameState(), 1000);
    state = registerTap(state);
    state = finish(state, 2000);
    state = registerTap(state);
    assert.equal(scoreOf(state), 1);
});

test("remainingMs giảm dần và không âm", () => {
    const started = begin(createGameState({ durationMs: 5000 }), 1000);
    assert.equal(remainingMs(started, 1000), 5000);
    assert.equal(remainingMs(started, 3000), 3000);
    assert.equal(remainingMs(started, 99999), 0);
});

test("playtimeOf tính theo mốc kết thúc", () => {
    const started = begin(createGameState(), 1000);
    const ended = finish(started, 4000);
    assert.equal(playtimeOf(ended), 3000);
    assert.equal(playtimeOf(createGameState()), 0);
});
