// Định dạng dữ liệu CHUẨN dùng chung giữa Game và Platform.
// Mọi game (client hoặc server) trả về đúng các payload này để các module
// Bảng xếp hạng / Giải đấu tiêu thụ mà không cần biết chi tiết từng game.
// Xem plans/platform-refactoring-plan.md (mục 3.4).

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function toFiniteNumber(value, fallback = 0) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export const SCORE_PAYLOAD_NUMERIC_FIELDS = Object.freeze(["score", "playtimeMs"]);

/**
 * Tạo ScorePayload chuẩn hoá. Trường thiếu được điền mặc định an toàn,
 * KHÔNG ném lỗi (dùng validateScorePayload nếu cần kiểm tra).
 *
 * @returns {import("./payloads.js").ScorePayload}
 */
export function createScorePayload({
    gameId = null,
    matchId = null,
    playerId = null,
    playerName = "",
    score = 0,
    playtimeMs = 0,
    rank = null,
    metadata = {},
    timestamp = new Date().toISOString(),
} = {}) {
    return {
        gameId,
        matchId,
        playerId,
        playerName,
        score: toFiniteNumber(score, 0),
        playtimeMs: Math.max(0, toFiniteNumber(playtimeMs, 0)),
        rank,
        metadata: metadata ?? {},
        timestamp,
    };
}

export function validateScorePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, errors: ["ScorePayload không phải object."] };
    }
    const errors = [];
    if (!isNonEmptyString(payload.gameId)) errors.push("ScorePayload thiếu gameId.");
    if (!isNonEmptyString(payload.playerId)) errors.push("ScorePayload thiếu playerId.");
    if (!isFiniteNumber(payload.score)) errors.push("ScorePayload.score phải là số hữu hạn.");
    if (!isFiniteNumber(payload.playtimeMs)) {
        errors.push("ScorePayload.playtimeMs phải là số.");
    } else if (payload.playtimeMs < 0) {
        errors.push("ScorePayload.playtimeMs không được âm.");
    }
    if (payload.rank != null && (!isFiniteNumber(payload.rank) || payload.rank < 1)) {
        errors.push("ScorePayload.rank phải là số >= 1 hoặc null.");
    }
    if (!isNonEmptyString(payload.timestamp)) errors.push("ScorePayload thiếu timestamp ISO 8601.");
    return { ok: errors.length === 0, errors };
}

export function assertScorePayload(payload) {
    const { ok, errors } = validateScorePayload(payload);
    if (!ok) throw new TypeError("ScorePayload không hợp lệ: " + errors.join(" "));
    return payload;
}

export function isScorePayload(value) {
    return validateScorePayload(value).ok;
}

/**
 * Payload khi một ván / trận kết thúc. Đây là thứ module Giải đấu sẽ tiêu thụ.
 *
 * @returns {import("./payloads.js").GameOverPayload}
 */
export function createGameOverPayload({
    gameId = null,
    matchId = null,
    players = [],
    winnerId = null,
    score = null,
    reason = null,
    metadata = {},
    timestamp = new Date().toISOString(),
} = {}) {
    return {
        gameId,
        matchId,
        players,
        winnerId,
        score,
        reason,
        metadata: metadata ?? {},
        timestamp,
    };
}

export function validateGameOverPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, errors: ["GameOverPayload không phải object."] };
    }
    const errors = [];
    if (!isNonEmptyString(payload.gameId)) errors.push("GameOverPayload thiếu gameId.");
    if (!Array.isArray(payload.players)) errors.push("GameOverPayload.players phải là mảng.");
    if (payload.winnerId != null && !isNonEmptyString(payload.winnerId)) {
        errors.push("GameOverPayload.winnerId không hợp lệ.");
    }
    if (!isNonEmptyString(payload.timestamp))
        errors.push("GameOverPayload thiếu timestamp ISO 8601.");
    return { ok: errors.length === 0, errors };
}

export function assertGameOverPayload(payload) {
    const { ok, errors } = validateGameOverPayload(payload);
    if (!ok) throw new TypeError("GameOverPayload không hợp lệ: " + errors.join(" "));
    return payload;
}
