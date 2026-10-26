function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createMatchLimiter({ limit = 1, maxQueued = 24 } = {}) {
    const capacity = positiveInteger(limit, 1);
    const queueCapacity = Number.isSafeInteger(maxQueued) && maxQueued >= 0 ? maxQueued : 24;
    let active = 0;
    const waiting = [];

    function releaseSlot() {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = waiting.shift();
            if (next) {
                if (next.signal) next.signal.removeEventListener("abort", next.onAbort);
                next.resolve(releaseSlot());
            } else {
                active--;
            }
        };
    }

    function acquire(signal) {
        if (signal?.aborted) return Promise.resolve(null);
        if (active < capacity) {
            active++;
            return Promise.resolve(releaseSlot());
        }
        if (waiting.length >= queueCapacity) {
            return Promise.reject(new Error("Hàng đợi trận đấu đã đầy, vui lòng thử lại sau."));
        }
        return new Promise((resolve) => {
            const waiter = { resolve, signal, onAbort: null };
            if (signal) {
                waiter.onAbort = () => {
                    const index = waiting.indexOf(waiter);
                    if (index !== -1) waiting.splice(index, 1);
                    signal.removeEventListener("abort", waiter.onAbort);
                    resolve(null);
                };
                signal.addEventListener("abort", waiter.onAbort, { once: true });
            }
            waiting.push(waiter);
        });
    }

    return { acquire };
}

const matchLimiter = createMatchLimiter({
    limit: positiveInteger(process.env.MAX_CONCURRENT_MATCHES, 1),
    maxQueued: positiveInteger(process.env.MAX_QUEUED_MATCHES, 24),
});

export const acquireMatchSlot = (signal) => matchLimiter.acquire(signal);
