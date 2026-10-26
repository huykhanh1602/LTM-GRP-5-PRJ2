import assert from "node:assert/strict";
import test from "node:test";

import { createMatchQueue } from "../net/matchmaking/queue.js";

const ranked = (queue, id, rating, extra = {}) => queue.add({ userId: id, gameId: "g", mode: "ranked", rating, ...extra });
const casual = (queue, id, extra = {}) => queue.add({ userId: id, gameId: "g", mode: "casual", ...extra });
const ids = (pair) => pair.map((entry) => entry.userId).sort();

test("casual ghép hai người chờ lâu nhất trước", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now });
  for (const id of ["a", "b", "c", "d", "e"]) { casual(queue, id); now += 10; }
  const pairs = queue.takePairs();
  assert.deepEqual(pairs.map(ids), [["a", "b"], ["c", "d"]]);
  assert.equal(queue.size, 1);
  assert.ok(queue.has("e"));
});

test("maxPairs chặn số cặp mỗi lượt và hasWork báo còn việc", () => {
  const queue = createMatchQueue();
  for (let i = 0; i < 20; i++) casual(queue, `u${i}`);
  assert.equal(queue.takePairs({ maxPairs: 3 }).length, 3);
  assert.equal(queue.hasWork(), true);
  let total = 3;
  while (queue.hasWork()) total += queue.takePairs({ maxPairs: 3 }).length;
  assert.equal(total, 10);
  assert.equal(queue.size, 0);
});

test("ranked chọn đối thủ có rating gần nhất trong cửa sổ", () => {
  const queue = createMatchQueue();
  ranked(queue, "me", 1000);
  ranked(queue, "far", 1090);
  ranked(queue, "near", 1010);
  ranked(queue, "below", 985);
  const pairs = queue.takePairs();
  assert.deepEqual(ids(pairs[0]), ["me", "near"]);
});

test("ranked không ghép người lệch quá cửa sổ cho tới khi chờ đủ lâu", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now, windowBase: 100, windowPerSec: 20 });
  ranked(queue, "low", 1000);
  ranked(queue, "high", 1300);
  assert.deepEqual(queue.takePairs(), []);
  now = 10_000;
  assert.equal(queue.takePairs().length, 1);
});

test("hàng ranked 4000 người rating rải rộng: mỗi lượt quét nhanh và vẫn quét hết sau nhiều lượt", () => {
  const queue = createMatchQueue();
  for (let i = 0; i < 4000; i++) ranked(queue, `u${i}`, i * 1000); // không cặp nào lệch vừa cửa sổ
  let worst = 0;
  let ticks = 0;
  queue.requestScan();
  while (queue.hasWork()) {
    const start = process.hrtime.bigint();
    assert.deepEqual(queue.takePairs({ maxPairs: 50 }), []);
    worst = Math.max(worst, Number(process.hrtime.bigint() - start) / 1e6);
    assert.ok(++ticks < 1000, "quét không bao giờ kết thúc");
  }
  assert.ok(ticks >= 2, "công việc phải được chia thành nhiều lượt");
  assert.ok(worst < 100, `một lượt quét mất ${worst.toFixed(1)} ms (trước khi tối ưu: ~830 ms)`);
  assert.equal(queue.size, 4000);
});

test("không ai nằm trong hai cặp dù ghép nhiều lượt, thêm và gỡ xen kẽ", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now });
  let seed = 7;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const matched = new Map();
  const removed = new Set();
  let next = 0;
  for (let round = 0; round < 200; round++) {
    for (let i = 0; i < 20; i++) {
      const id = `u${next++}`;
      if (random() < 0.5) ranked(queue, id, Math.floor(random() * 3000)); else casual(queue, id);
    }
    for (let i = 0; i < 5; i++) {
      const id = `u${Math.floor(random() * next)}`;
      if (queue.remove(id)) removed.add(id);
    }
    now += 500;
    for (const [a, b] of queue.takePairs({ maxPairs: 7 })) {
      for (const entry of [a, b]) {
        assert.ok(!matched.has(entry.userId), `${entry.userId} bị ghép hai lần`);
        assert.ok(!removed.has(entry.userId), `${entry.userId} đã rời hàng mà vẫn bị ghép`);
        matched.set(entry.userId, true);
        assert.equal(queue.has(entry.userId), false, "người đã ghép phải rời hàng");
      }
      assert.equal(a.mode, b.mode);
    }
  }
  assert.ok(matched.size > 500);
});

test("mọi cặp ranked đều nằm trong cửa sổ cho phép", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now, windowBase: 100, windowPerSec: 20 });
  for (let i = 0; i < 300; i++) ranked(queue, `u${i}`, (i * 37) % 2000);
  for (let step = 0; step < 60; step++) {
    now += 1000;
    for (const [a, b] of queue.takePairs()) {
      const allowed = 100 + 20 * Math.max(queue.waitSeconds(a), queue.waitSeconds(b));
      assert.ok(Math.abs(a.rating - b.rating) <= allowed);
    }
  }
});

test("xếp lại người bị ghép hụt giữ nguyên thời gian chờ và được ưu tiên", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now });
  const early = casual(queue, "early");
  now = 5000;
  casual(queue, "late");
  queue.remove("early");
  now = 9000;
  const back = casual(queue, "early", { joinedAt: early.joinedAt });
  assert.equal(back.joinedAt, 0);
  assert.equal(queue.waitSeconds(back), 9);
  casual(queue, "newest");
  assert.deepEqual(ids(queue.takePairs()[0]), ["early", "late"]);
});

test("add trùng userId bị từ chối và remove xóa khỏi mọi chỉ mục", () => {
  const queue = createMatchQueue();
  assert.ok(ranked(queue, "a", 1000));
  assert.equal(ranked(queue, "a", 1000), null);
  assert.equal(casual(queue, "a"), null);
  assert.equal(queue.remove("a"), true);
  assert.equal(queue.remove("a"), false);
  ranked(queue, "b", 1000);
  assert.deepEqual(queue.takePairs(), []);
  assert.equal(queue.size, 1);
});
