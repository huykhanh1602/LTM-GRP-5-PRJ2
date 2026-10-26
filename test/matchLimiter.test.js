import test from "node:test";
import assert from "node:assert/strict";
import { createMatchLimiter } from "../net/matchLimiter.js";

test("match limiter caps active work and rejects excess queued work", async () => {
  const limiter = createMatchLimiter({ limit: 1, maxQueued: 1 });
  const releaseFirst = await limiter.acquire();
  const secondPending = limiter.acquire();
  await assert.rejects(limiter.acquire(), /hàng đợi trận đấu đã đầy/i);

  releaseFirst();
  const releaseSecond = await secondPending;
  assert.equal(typeof releaseSecond, "function");
  releaseSecond();
});

test("match limiter removes aborted queued work", async () => {
  const limiter = createMatchLimiter({ limit: 1, maxQueued: 1 });
  const releaseFirst = await limiter.acquire();
  const controller = new AbortController();
  const abortedPending = limiter.acquire(controller.signal);
  controller.abort();

  assert.equal(await abortedPending, null);
  releaseFirst();
  const releaseNext = await limiter.acquire();
  releaseNext();
});
