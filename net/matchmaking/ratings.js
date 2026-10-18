// Điểm Elo TẠM THỜI, lưu trong bộ nhớ, để giao thức ranked chạy được từ đầu đến cuối.
// Huy thay bằng bản chính thức (lưu DB) mà giữ giao diện: get(), applyResult().
export function createRatingStore({ initial = 1000, k = 32 } = {}) {
    const ratings = new Map();
    const keyOf = (gameId, userId) => `${gameId}:${userId}`;
    const get = (gameId, userId) => ratings.get(keyOf(gameId, userId)) ?? initial;

    return {
        get,
        // winner: "a" | "b" | "draw". Trả về { a: {before, after, change}, b: {...} }.
        applyResult({ gameId, userA, userB, winner }) {
            const ra = get(gameId, userA);
            const rb = get(gameId, userB);
            const expectedA = 1 / (1 + 10 ** ((rb - ra) / 400));
            const scoreA = winner === "a" ? 1 : winner === "b" ? 0 : 0.5;
            const changeA = Math.round(k * (scoreA - expectedA));
            const changeB = -changeA;
            ratings.set(keyOf(gameId, userA), ra + changeA);
            ratings.set(keyOf(gameId, userB), rb + changeB);
            return {
                a: { before: ra, after: ra + changeA, change: changeA },
                b: { before: rb, after: rb + changeB, change: changeB },
            };
        },
    };
}
