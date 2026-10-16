import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameRegistry } from "../../src/platform/core/GameRegistry.js";
import { createEventBus } from "../../src/platform/core/EventBus.js";
import { Events } from "../../src/shared/protocol/events.js";

function makePlugin(overrides = {}) {
    return {
        async init() {},
        async start() {},
        pause() {},
        resume() {},
        destroy() {},
        getScore() {
            return { score: 1 };
        },
        onGameOver() {},
        Component: function Demo() {
            return null;
        },
        ...overrides,
    };
}

function makeManifest(overrides = {}) {
    return {
        id: "demo",
        name: "Demo Game",
        kind: "client",
        load: async () => makePlugin(),
        ...overrides,
    };
}

test("register, list, get và has hoạt động", () => {
    const registry = createGameRegistry();
    registry.register(makeManifest());
    assert.equal(registry.has("demo"), true);
    assert.equal(registry.get("demo").name, "Demo Game");
    assert.deepEqual(registry.ids(), ["demo"]);
    assert.equal(registry.list().length, 1);
});

test("đăng ký trùng id thì ném lỗi", () => {
    const registry = createGameRegistry();
    registry.register(makeManifest());
    assert.throws(() => registry.register(makeManifest()), /đã được đăng ký/);
});

test("manifest thiếu load thì ném lỗi", () => {
    const registry = createGameRegistry();
    assert.throws(() => registry.register(makeManifest({ load: undefined })), TypeError);
});

test("manifest id sai định dạng thì ném lỗi", () => {
    const registry = createGameRegistry();
    assert.throws(() => registry.register(makeManifest({ id: "Demo Game" })), TypeError);
});

test("register phát sự kiện GAME_REGISTERED", () => {
    const eventBus = createEventBus();
    const events = [];
    eventBus.on(Events.GAME_REGISTERED, (payload) => events.push(payload));
    const registry = createGameRegistry({ eventBus });
    registry.register(makeManifest());
    assert.deepEqual(events, [{ id: "demo", kind: "client", name: "Demo Game" }]);
});

test("load nạp plugin một lần duy nhất và cache", async () => {
    let calls = 0;
    const registry = createGameRegistry();
    registry.register(
        makeManifest({
            load: async () => {
                calls++;
                return makePlugin();
            },
        }),
    );
    const first = await registry.load("demo");
    const second = await registry.load("demo");
    assert.equal(calls, 1);
    assert.equal(first, second);
    assert.equal(registry.isLoaded("demo"), true);
});

test("load gắn manifest đã đăng ký nếu plugin thiếu", async () => {
    const registry = createGameRegistry();
    registry.register(makeManifest({ load: async () => makePlugin({ manifest: undefined }) }));
    const plugin = await registry.load("demo");
    assert.equal(plugin.manifest.id, "demo");
});

test("load game chưa đăng ký thì ném lỗi", async () => {
    const registry = createGameRegistry();
    await assert.rejects(() => registry.load("missing"), /chưa được đăng ký/);
});

test("load plugin thiếu Component của game client thì ném lỗi", async () => {
    const registry = createGameRegistry();
    registry.register(makeManifest({ load: async () => makePlugin({ Component: undefined }) }));
    await assert.rejects(() => registry.load("demo"), TypeError);
});

test("registerAll bỏ qua id trùng khi override=false", () => {
    const registry = createGameRegistry();
    registry.register(makeManifest());
    const added = registry.registerAll([
        makeManifest(),
        makeManifest({ id: "other", name: "Other" }),
    ]);
    assert.equal(added.length, 1);
    assert.equal(added[0].id, "other");
});

test("unload xóa cache nhưng giữ manifest", async () => {
    const registry = createGameRegistry();
    registry.register(makeManifest());
    await registry.load("demo");
    registry.unload("demo");
    assert.equal(registry.isLoaded("demo"), false);
    assert.equal(registry.has("demo"), true);
});
