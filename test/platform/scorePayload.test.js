import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createScorePayload,
    assertScorePayload,
    validateScorePayload,
} from "../../src/shared/protocol/payloads.js";
import { isScorePayload, normalizeScore } from "../../src/platform/core/scorePayload.js";

test("createScorePayload điền mặc định và ép số", () => {
    const payload = createScorePayload({
        gameId: "demo",
        playerId: "p1",
        score: "15",
        playtimeMs: "2000",
    });
    assert.equal(payload.gameId, "demo");
    assert.equal(payload.score, 15);
    assert.equal(payload.playtimeMs, 2000);
    assert.equal(typeof payload.timestamp, "string");
});

test("createScorePayload không cho playtimeMs âm", () => {
    const payload = createScorePayload({ gameId: "demo", playerId: "p1", playtimeMs: -50 });
    assert.equal(payload.playtimeMs, 0);
});

test("validateScorePayload chấp nhận payload hợp lệ", () => {
    const payload = createScorePayload({ gameId: "demo", playerId: "p1", score: 3 });
    assert.equal(validateScorePayload(payload).ok, true);
});

test("validateScorePayload báo thiếu gameId và playerId", () => {
    const result = validateScorePayload({
        score: 1,
        playtimeMs: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
});

test("validateScorePayload báo rank không hợp lệ", () => {
    const payload = createScorePayload({ gameId: "demo", playerId: "p1", rank: 0 });
    const result = validateScorePayload(payload);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /rank/);
});

test("assertScorePayload ném lỗi khi payload sai", () => {
    assert.throws(() => assertScorePayload({ gameId: "demo" }), TypeError);
});

test("normalizeScore gộp giá trị mặc định", () => {
    const payload = normalizeScore(
        { score: 7 },
        { gameId: "demo", playerId: "p9", playerName: "Nine" },
    );
    assert.equal(payload.gameId, "demo");
    assert.equal(payload.playerId, "p9");
    assert.equal(payload.playerName, "Nine");
    assert.equal(payload.score, 7);
    assert.equal(payload.playtimeMs, 0);
});

test("isScorePayload phân biệt payload hợp lệ và không hợp lệ", () => {
    assert.equal(isScorePayload(createScorePayload({ gameId: "demo", playerId: "p1" })), true);
    assert.equal(isScorePayload(null), false);
    assert.equal(isScorePayload({ gameId: "demo" }), false);
});
