import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "../../src/platform/core/EventBus.js";
import { createGameSession } from "../../src/platform/core/GameSession.js";
import { LifecycleState } from "../../src/platform/core/contracts.js";
import { Events } from "../../src/shared/protocol/events.js";
import { validateScorePayload } from "../../src/shared/protocol/payloads.js";

function makePlugin(overrides = {}) {
    const calls = { init: 0, start: 0, pause: 0, resume: 0, destroy: 0 };
    let overCallback = null;
    const plugin = {
        manifest: { id: "demo", name: "Demo", kind: "client" },
        calls,
        emitOver: (event) => overCallback?.(event),
        async init() {
            calls.init++;
        },
        async start() {
            calls.start++;
        },
        pause() {
            calls.pause++;
        },
        resume() {
            calls.resume++;
        },
        destroy() {
            calls.destroy++;
        },
        getScore() {
            return { playerId: "p1", playerName: "Player", score: 10, playtimeMs: 1000 };
        },
        onGameOver(callback) {
            overCallback = callback;
        },
        ...overrides,
    };
    return plugin;
}

function trackEvents(eventBus) {
    const seen = [];
    eventBus.on("*", (_payload, event) => seen.push(event));
    return seen;
}

test("launch chạy init, start và phát GAME_LAUNCHED/GAME_STARTED", async () => {
    const plugin = makePlugin();
    const eventBus = createEventBus();
    const events = trackEvents(eventBus);
    const session = createGameSession({ plugin, eventBus });

    await session.launch();

    assert.equal(plugin.calls.init, 1);
    assert.equal(plugin.calls.start, 1);
    assert.equal(session.state, LifecycleState.RUNNING);
    assert.ok(events.includes(Events.GAME_LAUNCHED));
    assert.ok(events.includes(Events.GAME_STARTED));
});

test("pause và resume chuyển trạng thái và phát sự kiện", async () => {
    const plugin = makePlugin();
    const eventBus = createEventBus();
    const events = trackEvents(eventBus);
    const session = createGameSession({ plugin, eventBus });
    await session.launch();

    assert.equal(session.pause(), true);
    assert.equal(session.state, LifecycleState.PAUSED);
    assert.equal(session.resume(), true);
    assert.equal(session.state, LifecycleState.RUNNING);
    assert.ok(events.includes(Events.GAME_PAUSED));
    assert.ok(events.includes(Events.GAME_RESUMED));
});

test("pause khi chưa chạy trả về false", () => {
    const session = createGameSession({ plugin: makePlugin() });
    assert.equal(session.pause(), false);
});

test("end phát SCORE_UPDATED rồi GAME_OVER", async () => {
    const eventBus = createEventBus();
    const events = trackEvents(eventBus);
    const session = createGameSession({ plugin: makePlugin(), eventBus });
    await session.launch();
    events.length = 0;

    assert.equal(session.end({ winnerId: "p1", reason: "DRAW" }), true);

    assert.deepEqual(events, [Events.SCORE_UPDATED, Events.GAME_OVER]);
    assert.equal(session.state, LifecycleState.OVER);
    assert.equal(session.lastResult.winnerId, "p1");
    assert.equal(session.lastResult.gameId, "demo");
});

test("plugin báo game over thì session tự end", async () => {
    const plugin = makePlugin();
    const eventBus = createEventBus();
    const events = trackEvents(eventBus);
    const session = createGameSession({ plugin, eventBus });
    await session.launch();
    events.length = 0;

    plugin.emitOver({ winnerId: "p1" });

    assert.equal(session.state, LifecycleState.OVER);
    assert.ok(events.includes(Events.GAME_OVER));
});

test("launch hai lần thì ném lỗi", async () => {
    const session = createGameSession({ plugin: makePlugin() });
    await session.launch();
    await assert.rejects(() => session.launch(), /đã được khởi chạy/);
});

test("destroy gọi plugin.destroy và phát GAME_DESTROYED", async () => {
    const plugin = makePlugin();
    const eventBus = createEventBus();
    const events = trackEvents(eventBus);
    const session = createGameSession({ plugin, eventBus });
    await session.launch();
    events.length = 0;

    assert.equal(session.destroy(), true);
    assert.equal(plugin.calls.destroy, 1);
    assert.equal(session.state, LifecycleState.DESTROYED);
    assert.ok(events.includes(Events.GAME_DESTROYED));
    assert.equal(session.destroy(), false);
});

test("getScore trả ScorePayload chuẩn hoá có gameId hợp lệ", async () => {
    const session = createGameSession({ plugin: makePlugin() });
    await session.launch();

    const score = session.getScore();

    assert.equal(score.gameId, "demo");
    assert.equal(score.playerId, "p1");
    assert.equal(score.score, 10);
    assert.equal(validateScorePayload(score).ok, true);
});

test("onStateChange nhận các lần chuyển trạng thái", async () => {
    const session = createGameSession({ plugin: makePlugin() });
    const transitions = [];
    session.onStateChange((detail) => transitions.push(`${detail.from}->${detail.to}`));
    await session.launch();
    session.pause();
    session.destroy();
    assert.deepEqual(transitions, ["idle->running", "running->paused", "paused->destroyed"]);
});
