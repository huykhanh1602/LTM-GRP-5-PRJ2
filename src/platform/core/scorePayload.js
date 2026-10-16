// Chuẩn hoá dữ liệu điểm số trả về từ game.
// Tầng shared định nghĩa khuôn ScorePayload; ở đây bọc thêm helper tiện dụng
// cho Platform (không định nghĩa lại khuôn để tránh trùng lặp).

import {
    assertScorePayload,
    createScorePayload,
    isScorePayload,
    validateScorePayload,
} from "../../shared/protocol/payloads.js";

export { assertScorePayload, createScorePayload, isScorePayload, validateScorePayload };

/**
 * Chuẩn hoá một payload thô (có thể thiếu trường) thành ScorePayload đầy đủ.
 * @param {object} raw
 * @param {{ gameId?: string, playerId?: string, playerName?: string }} [defaults]
 */
export function normalizeScore(raw, { gameId, playerId, playerName } = {}) {
    return createScorePayload({
        gameId: raw?.gameId ?? gameId,
        playerId: raw?.playerId ?? playerId,
        playerName: raw?.playerName ?? playerName ?? "",
        score: raw?.score ?? 0,
        playtimeMs: raw?.playtimeMs ?? 0,
        matchId: raw?.matchId ?? null,
        rank: raw?.rank ?? null,
        metadata: raw?.metadata ?? {},
        timestamp: raw?.timestamp ?? new Date().toISOString(),
    });
}
