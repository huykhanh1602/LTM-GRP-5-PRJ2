// Hàng đợi ghép trận. Thuần logic, không biết gì về WebSocket.
//
//  - casual: ghép hai người chờ lâu nhất (FIFO).
//  - ranked: ghép hai người có rating gần nhau. Khoảng cho phép = windowBase + windowPerSec * (giây chờ
//    của người chờ lâu hơn trong cặp), nên chờ càng lâu càng dễ được ghép.
//
// Chi phí được chặn để hàng đợi vài nghìn người không chiếm event loop:
//  - Mỗi lần takePairs chỉ xét tối đa `maxFirsts` người chờ lâu nhất (có con trỏ xoay vòng để không ai bị bỏ đói)
//    và với mỗi người chỉ xét tối đa `maxCandidates` ứng viên có rating gần nhất (mảng sắp theo rating + tìm nhị phân).
//  - takePairs có thể dừng sớm sau `maxPairs` cặp; hasWork() cho biết còn việc dang dở để bên gọi tự hẹn lượt sau.
//  - Hai người luôn bị gỡ khỏi hàng trước khi cặp được trả về, nên không ai xuất hiện trong hai cặp.
const DEFAULTS = { maxFirsts: 200, maxCandidates: 50 };

function compareEntries(a, b) {
    return a.rating - b.rating || a.seq - b.seq;
}

function lowerBound(sorted, entry) {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (compareEntries(sorted[middle], entry) < 0) low = middle + 1;
        else high = middle;
    }
    return low;
}

export function createMatchQueue({
    now = Date.now,
    windowBase = 100,
    windowPerSec = 20,
    maxFirsts = DEFAULTS.maxFirsts,
    maxCandidates = DEFAULTS.maxCandidates,
} = {}) {
    const lists = new Map(); // "game_id|mode" -> { entries: Map(userId -> entry), sorted: entry[], offset, unordered }
    const byUser = new Map();
    const keyOf = (gameId, mode) => `${gameId}|${mode}`;
    let sequence = 0;
    let pending = false;

    function waitSeconds(entry) {
        return Math.max(0, Math.floor((now() - entry.joinedAt) / 1000));
    }

    function removeEntry(entry) {
        byUser.delete(entry.userId);
        const key = keyOf(entry.gameId, entry.mode);
        const list = lists.get(key);
        if (!list) return;
        list.entries.delete(entry.userId);
        if (entry.mode === "ranked") {
            const index = lowerBound(list.sorted, entry);
            if (list.sorted[index] === entry) list.sorted.splice(index, 1);
        }
        if (list.entries.size === 0) lists.delete(key);
    }

    // Phần tử đầu của Map phải là người chờ lâu nhất. Xếp lại hàng với joinedAt cũ có thể phá thứ tự này.
    function restoreOrder(list) {
        if (!list.unordered) return;
        list.unordered = false;
        const ordered = [...list.entries.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.seq - b.seq);
        list.entries = new Map(ordered.map((entry) => [entry.userId, entry]));
    }

    // Ứng viên tốt nhất cho `first`: duyệt từ gần ra xa theo rating, dừng sau `maxCandidates`.
    function findPartner(list, first, longestWaitSeconds) {
        const { sorted } = list;
        const center = lowerBound(sorted, first);
        const hardLimit = windowBase + windowPerSec * longestWaitSeconds; // xa hơn mức này thì không ai ghép được
        const firstWait = waitSeconds(first);
        let left = center - 1;
        let right = center + 1;
        for (let seen = 0; seen < maxCandidates; seen++) {
            const leftGap = left >= 0 ? Math.abs(first.rating - sorted[left].rating) : Infinity;
            const rightGap = right < sorted.length ? Math.abs(first.rating - sorted[right].rating) : Infinity;
            if (leftGap === Infinity && rightGap === Infinity) return null;
            const useLeft = leftGap <= rightGap;
            const gap = useLeft ? leftGap : rightGap;
            if (gap > hardLimit) return null;
            const other = useLeft ? sorted[left--] : sorted[right++];
            const allowed = windowBase + windowPerSec * Math.max(firstWait, waitSeconds(other));
            if (gap <= allowed) return other; // duyệt theo gap tăng dần nên đây là người gần nhất
        }
        return null;
    }

    function scanCasual(list, pairs, maxPairs) {
        while (list.entries.size >= 2) {
            if (pairs.length >= maxPairs) return false;
            const iterator = list.entries.values();
            const first = iterator.next().value;
            const second = iterator.next().value;
            removeEntry(first);
            removeEntry(second);
            pairs.push([first, second]);
        }
        return true;
    }

    function scanRanked(list, pairs, maxPairs, budget) {
        restoreOrder(list);
        const size = list.entries.size;
        if (size < 2) return true;
        const start = list.offset < size ? list.offset : 0;
        const firsts = [];
        let position = 0;
        for (const entry of list.entries.values()) {
            if (position++ < start) continue;
            firsts.push(entry);
            if (firsts.length >= budget) break;
        }
        const longestWait = waitSeconds(list.entries.values().next().value);
        let handled = 0;
        let matched = 0;
        for (const first of firsts) {
            if (pairs.length >= maxPairs) break;
            handled++;
            if (!list.entries.has(first.userId)) continue; // đã bị ghép với người khác trong lượt này
            const other = findPartner(list, first, longestWait);
            if (!other) continue;
            removeEntry(first);
            removeEntry(other);
            pairs.push([first, other]);
            matched++;
        }
        const reachedEnd = handled === firsts.length && start + firsts.length >= size;
        list.offset = reachedEnd ? 0 : start + Math.max(0, handled - matched);
        return reachedEnd;
    }

    return {
        has: (userId) => byUser.has(userId),
        get: (userId) => byUser.get(userId) ?? null,
        waitSeconds,

        // joinedAt chỉ dùng khi xếp lại người bị ghép hụt, để họ không mất thời gian đã chờ.
        add({ userId, gameId, mode, rating = 0, joinedAt = now() }) {
            if (byUser.has(userId)) return null;
            const entry = { userId, gameId, mode, rating, joinedAt, seq: sequence++ };
            const key = keyOf(gameId, mode);
            let list = lists.get(key);
            if (!list) {
                list = { entries: new Map(), sorted: [], offset: 0, unordered: false, lastJoinedAt: -Infinity };
                lists.set(key, list);
            }
            if (joinedAt < list.lastJoinedAt) list.unordered = true;
            else list.lastJoinedAt = joinedAt;
            list.entries.set(userId, entry);
            if (mode === "ranked") list.sorted.splice(lowerBound(list.sorted, entry), 0, entry);
            byUser.set(userId, entry);
            pending = true;
            return entry;
        },

        remove(userId) {
            const entry = byUser.get(userId);
            if (!entry) return false;
            removeEntry(entry);
            return true;
        },

        // Lấy ra các cặp ghép được và xóa họ khỏi hàng. Công việc mỗi lần gọi bị chặn bởi các tùy chọn.
        takePairs({ maxPairs = Infinity } = {}) {
            const pairs = [];
            let complete = true;
            for (const list of [...lists.values()]) {
                if (pairs.length >= maxPairs) {
                    complete = false;
                    break;
                }
                const sample = list.entries.values().next().value;
                if (!sample) continue;
                const done = sample.mode === "ranked"
                    ? scanRanked(list, pairs, maxPairs, maxFirsts)
                    : scanCasual(list, pairs, maxPairs);
                if (!done) complete = false;
            }
            pending = !complete;
            return pairs;
        },

        // true khi còn người chưa được xét hết hoặc có người mới vào kể từ lần quét đầy đủ gần nhất.
        hasWork: () => pending,
        // Cửa sổ rating nới dần theo thời gian: bên gọi đánh dấu để quét lại toàn bộ hàng.
        requestScan() {
            pending = byUser.size > 1;
        },

        entries: () => [...byUser.values()],
        get size() {
            return byUser.size;
        },
    };
}
