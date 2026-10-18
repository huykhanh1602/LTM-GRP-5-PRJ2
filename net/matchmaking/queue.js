// Hàng đợi ghép trận. Thuần logic, không biết gì về WebSocket.
//
//  - casual: ghép hai người chờ lâu nhất (FIFO).
//  - ranked: ghép hai người có rating gần nhau. Khoảng cho phép = windowBase + windowPerSec * (giây chờ
//    của người chờ lâu hơn trong cặp), nên chờ càng lâu càng dễ được ghép.
export function createMatchQueue({ now = Date.now, windowBase = 100, windowPerSec = 20 } = {}) {
    const lists = new Map(); // "game_id|mode" -> entry[] theo thứ tự vào hàng
    const keyOf = (gameId, mode) => `${gameId}|${mode}`;
    const byUser = new Map();

    function waitSeconds(entry) {
        return Math.max(0, Math.floor((now() - entry.joinedAt) / 1000));
    }

    return {
        has: (userId) => byUser.has(userId),
        get: (userId) => byUser.get(userId) ?? null,
        waitSeconds,

        add({ userId, gameId, mode, rating = 0 }) {
            if (byUser.has(userId)) return null;
            const entry = { userId, gameId, mode, rating, joinedAt: now() };
            const key = keyOf(gameId, mode);
            if (!lists.has(key)) lists.set(key, []);
            lists.get(key).push(entry);
            byUser.set(userId, entry);
            return entry;
        },

        remove(userId) {
            const entry = byUser.get(userId);
            if (!entry) return false;
            byUser.delete(userId);
            const key = keyOf(entry.gameId, entry.mode);
            const list = lists.get(key).filter((candidate) => candidate !== entry);
            if (list.length) lists.set(key, list);
            else lists.delete(key);
            return true;
        },

        // Lấy ra mọi cặp ghép được ở thời điểm hiện tại và xóa họ khỏi hàng.
        takePairs() {
            const pairs = [];
            for (const list of [...lists.values()]) {
                const waiting = [...list];
                while (waiting.length >= 2) {
                    const first = waiting[0];
                    let best = null;
                    for (const other of waiting.slice(1)) {
                        if (first.mode === "ranked") {
                            const allowed = windowBase + windowPerSec * Math.max(waitSeconds(first), waitSeconds(other));
                            const gap = Math.abs(first.rating - other.rating);
                            if (gap > allowed) continue;
                            if (!best || gap < best.gap) best = { other, gap };
                        } else {
                            best = { other, gap: 0 };
                            break;
                        }
                    }
                    if (!best) {
                        waiting.shift(); // người này chưa có đối thủ hợp, thử người kế tiếp
                        continue;
                    }
                    waiting.splice(waiting.indexOf(best.other), 1);
                    waiting.shift();
                    this.remove(first.userId);
                    this.remove(best.other.userId);
                    pairs.push([first, best.other]);
                }
            }
            return pairs;
        },

        entries: () => [...byUser.values()],
        get size() {
            return byUser.size;
        },
    };
}
