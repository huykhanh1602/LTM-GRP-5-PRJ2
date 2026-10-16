// Event Bus: cầu nối DUY NHẤT giữa Game và các tính năng Platform
// (bảng điểm, giải đấu, analytics). Không phụ thuộc React.
// Xem plans/platform-refactoring-plan.md (mục 3.1, 3.3).

import { WILDCARD } from "../../shared/protocol/events.js";

/**
 * @param {{ onListenerError?: (error: unknown, info: {event: string, payload: unknown}) => void }} [options]
 */
export function createEventBus({ onListenerError } = {}) {
    /** @type {Map<string, Set<{event: string, listener: Function, once: boolean}>>} */
    const listeners = new Map();

    function ensure(event) {
        let set = listeners.get(event);
        if (!set) {
            set = new Set();
            listeners.set(event, set);
        }
        return set;
    }

    function subscribe(event, listener, once) {
        if (typeof event !== "string" || !event.trim()) {
            throw new TypeError("Tên sự kiện phải là chuỗi không rỗng.");
        }
        if (typeof listener !== "function") {
            throw new TypeError("Listener phải là hàm.");
        }
        const entry = { event, listener, once };
        ensure(event).add(entry);
        return () => remove(event, entry);
    }

    function remove(event, entry) {
        const set = listeners.get(event);
        if (!set) return false;
        const deleted = set.delete(entry);
        if (!set.size) listeners.delete(event);
        return deleted;
    }

    /** Đăng ký nghe một sự kiện (hoặc WILDCARD). Trả về hàm hủy đăng ký. */
    function on(event, listener) {
        return subscribe(event, listener, false);
    }

    /** Nghe đúng một lần. */
    function once(event, listener) {
        return subscribe(event, listener, true);
    }

    /** Hủy một listener cụ thể. */
    function off(event, listener) {
        const set = listeners.get(event);
        if (!set) return false;
        let removed = false;
        for (const entry of [...set]) {
            if (entry.listener === listener) removed = remove(event, entry) || removed;
        }
        return removed;
    }

    /**
     * Phát sự kiện tới listener chính xác + listener WILDCARD.
     * Lỗi của một listener KHÔNG làm gãy các listener khác.
     * @returns {number} số listener đã nhận sự kiện thành công.
     */
    function emit(event, payload) {
        if (typeof event !== "string" || !event.trim()) {
            throw new TypeError("Sự kiện phát ra phải có tên.");
        }
        const targets = [];
        const exact = listeners.get(event);
        if (exact) targets.push(...exact);
        if (event !== WILDCARD) {
            const wildcard = listeners.get(WILDCARD);
            if (wildcard) targets.push(...wildcard);
        }

        let delivered = 0;
        for (const entry of targets) {
            // once: gỡ trước khi gọi để tránh đăng ký lặp.
            if (entry.once) remove(entry.event, entry);
            try {
                entry.listener(payload, event);
                delivered++;
            } catch (error) {
                if (onListenerError) onListenerError(error, { event, payload });
                else console.error(`[EventBus] Listener xử lý "${event}" gặp lỗi:`, error);
            }
        }
        return delivered;
    }

    function clear(event) {
        if (event === undefined) {
            listeners.clear();
            return;
        }
        listeners.delete(event);
    }

    function listenerCount(event) {
        return listeners.get(event)?.size ?? 0;
    }

    function hasListeners(event) {
        return listenerCount(event) > 0;
    }

    function eventNames() {
        return [...listeners.keys()];
    }

    return { on, once, off, emit, clear, listenerCount, hasListeners, eventNames };
}
