import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "../../src/platform/core/EventBus.js";
import { WILDCARD } from "../../src/shared/protocol/events.js";

test("emit gọi listener và trả về số listener đã nhận", () => {
    const bus = createEventBus();
    const seen = [];
    bus.on("PING", (payload) => seen.push(payload));
    const delivered = bus.emit("PING", 42);
    assert.equal(delivered, 1);
    assert.deepEqual(seen, [42]);
});

test("on trả về hàm hủy đăng ký", () => {
    const bus = createEventBus();
    let count = 0;
    const unsubscribe = bus.on("PING", () => count++);
    bus.emit("PING");
    unsubscribe();
    bus.emit("PING");
    assert.equal(count, 1);
    assert.equal(bus.listenerCount("PING"), 0);
});

test("once chỉ nhận đúng một lần", () => {
    const bus = createEventBus();
    let count = 0;
    bus.once("PING", () => count++);
    bus.emit("PING");
    bus.emit("PING");
    assert.equal(count, 1);
    assert.equal(bus.hasListeners("PING"), false);
});

test("off hủy đúng listener cụ thể", () => {
    const bus = createEventBus();
    const a = () => {};
    const b = () => {};
    bus.on("PING", a);
    bus.on("PING", b);
    assert.equal(bus.off("PING", a), true);
    assert.equal(bus.listenerCount("PING"), 1);
    assert.equal(bus.off("PING", a), false);
});

test("wildcard nhận mọi sự kiện", () => {
    const bus = createEventBus();
    const events = [];
    bus.on(WILDCARD, (_payload, event) => events.push(event));
    bus.emit("A");
    bus.emit("B", 1);
    assert.deepEqual(events, ["A", "B"]);
});

test("lỗi của một listener không ảnh hưởng listener khác", () => {
    const errors = [];
    const bus = createEventBus({ onListenerError: (error) => errors.push(error) });
    let reached = false;
    bus.on("PING", () => {
        throw new Error("boom");
    });
    bus.on("PING", () => {
        reached = true;
    });
    const delivered = bus.emit("PING");
    assert.equal(reached, true);
    assert.equal(delivered, 1);
    assert.equal(errors.length, 1);
});

test("emit tên rỗng thì ném lỗi", () => {
    const bus = createEventBus();
    assert.throws(() => bus.emit(""), TypeError);
});

test("on với listener không phải hàm thì ném lỗi", () => {
    const bus = createEventBus();
    assert.throws(() => bus.on("PING", 123), TypeError);
});

test("clear xóa toàn bộ listener", () => {
    const bus = createEventBus();
    bus.on("PING", () => {});
    bus.on("PONG", () => {});
    bus.clear();
    assert.deepEqual(bus.eventNames(), []);
});
