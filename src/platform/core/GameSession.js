// GameSession: bọc một plugin game và điều khiển vòng đời của nó bằng một
// máy trạng thái rõ ràng. Mọi thay đổi trạng thái và điểm số đều được đẩy lên
// EventBus để Platform (bảng điểm / giải đấu) lắng nghe.
// Xem plans/platform-refactoring-plan.md (mục 3.2).

import { Events } from "../../shared/protocol/events.js";
import { createGameOverPayload, createScorePayload } from "../../shared/protocol/payloads.js";
import { LifecycleState } from "./contracts.js";

const TRANSITIONS = Object.freeze({
    [LifecycleState.IDLE]: [LifecycleState.RUNNING, LifecycleState.DESTROYED],
    [LifecycleState.RUNNING]: [
        LifecycleState.PAUSED,
        LifecycleState.OVER,
        LifecycleState.DESTROYED,
    ],
    [LifecycleState.PAUSED]: [
        LifecycleState.RUNNING,
        LifecycleState.OVER,
        LifecycleState.DESTROYED,
    ],
    [LifecycleState.OVER]: [LifecycleState.DESTROYED],
    [LifecycleState.DESTROYED]: [],
});

/**
 * @param {{
 *   plugin: object,
 *   manifest?: object,
 *   context?: object,
 *   eventBus?: ReturnType<import("./EventBus.js").createEventBus>,
 * }} options
 */
export function createGameSession({ plugin, manifest = null, context = {}, eventBus = null } = {}) {
    if (!plugin || typeof plugin !== "object") {
        throw new TypeError("createGameSession cần một plugin hợp lệ.");
    }
    const meta = manifest ?? plugin.manifest ?? {};
    const gameId = meta.id ?? plugin.manifest?.id ?? "unknown";

    let state = LifecycleState.IDLE;
    let lastScore = null;
    let lastResult = null;
    const stateListeners = new Set();

    function canTransition(next) {
        return (TRANSITIONS[state] ?? []).includes(next);
    }

    function transition(next) {
        if (!canTransition(next)) {
            throw new Error(`Không thể chuyển trạng thái game từ "${state}" sang "${next}".`);
        }
        const previous = state;
        state = next;
        const detail = { gameId, from: previous, to: state };
        for (const listener of [...stateListeners]) {
            try {
                listener(detail);
            } catch (error) {
                console.error("[GameSession] state listener gặp lỗi:", error);
            }
        }
        return detail;
    }

    const ctx = {
        ...context,
        gameId,
        manifest: meta,
        eventBus,
        emit: (event, payload) => eventBus?.emit(event, payload),
    };

    function safeGetScore() {
        try {
            return getScore();
        } catch (error) {
            console.warn(`[GameSession] getScore() của "${gameId}" gặp lỗi:`, error);
            return lastScore;
        }
    }

    function handlePluginGameOver(event) {
        if (state !== LifecycleState.RUNNING && state !== LifecycleState.PAUSED) return;
        end(event ?? {});
    }

    /** Khởi chạy: init -> RUNNING -> start. */
    async function launch() {
        if (state !== LifecycleState.IDLE) {
            throw new Error(`Game "${gameId}" đã được khởi chạy (trạng thái: ${state}).`);
        }
        await plugin.init(ctx);
        plugin.onGameOver(handlePluginGameOver);
        transition(LifecycleState.RUNNING);
        eventBus?.emit(Events.GAME_LAUNCHED, { gameId, kind: meta.kind ?? null });
        await plugin.start();
        eventBus?.emit(Events.GAME_STARTED, { gameId });
        return session;
    }

    function pause() {
        if (state !== LifecycleState.RUNNING) return false;
        plugin.pause();
        transition(LifecycleState.PAUSED);
        eventBus?.emit(Events.GAME_PAUSED, { gameId });
        return true;
    }

    function resume() {
        if (state !== LifecycleState.PAUSED) return false;
        plugin.resume();
        transition(LifecycleState.RUNNING);
        eventBus?.emit(Events.GAME_RESUMED, { gameId });
        return true;
    }

    /** Lấy chuẩn hoá ScorePayload hiện tại từ game. */
    function getScore() {
        const raw = plugin.getScore() ?? {};
        lastScore = createScorePayload({
            gameId,
            ...raw,
            timestamp: raw.timestamp ?? new Date().toISOString(),
        });
        return lastScore;
    }

    /** Phát điểm hiện tại lên EventBus (SCORE_UPDATED). */
    function publishScore() {
        const payload = getScore();
        eventBus?.emit(Events.SCORE_UPDATED, payload);
        return payload;
    }

    /** Kết thúc ván: phát SCORE_UPDATED (nếu có) rồi GAME_OVER. */
    function end(result = {}) {
        if (state !== LifecycleState.RUNNING && state !== LifecycleState.PAUSED) return false;
        const score = safeGetScore();
        if (score) eventBus?.emit(Events.SCORE_UPDATED, score);
        lastResult = createGameOverPayload({
            gameId,
            matchId: result.matchId ?? meta.matchId ?? null,
            players: result.players ?? [],
            winnerId: result.winnerId ?? result.winner ?? null,
            score,
            reason: result.reason ?? null,
            metadata: result.metadata ?? {},
            timestamp: result.timestamp ?? new Date().toISOString(),
        });
        transition(LifecycleState.OVER);
        eventBus?.emit(Events.GAME_OVER, lastResult);
        return true;
    }

    /** Hủy phiên chơi (từ bất kỳ trạng thái nào trừ DESTROYED). */
    function destroy() {
        if (state === LifecycleState.DESTROYED) return false;
        try {
            plugin.destroy();
        } catch (error) {
            console.error(`[GameSession] destroy() của "${gameId}" gặp lỗi:`, error);
        }
        transition(LifecycleState.DESTROYED);
        eventBus?.emit(Events.GAME_DESTROYED, { gameId });
        return true;
    }

    function onStateChange(listener) {
        if (typeof listener !== "function") throw new TypeError("onStateChange cần một hàm.");
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
    }

    const session = {
        get gameId() {
            return gameId;
        },
        get kind() {
            return meta.kind ?? null;
        },
        get manifest() {
            return meta;
        },
        get plugin() {
            return plugin;
        },
        get context() {
            return ctx;
        },
        get state() {
            return state;
        },
        get lastScore() {
            return lastScore;
        },
        get lastResult() {
            return lastResult;
        },
        isRunning() {
            return state === LifecycleState.RUNNING;
        },
        launch,
        pause,
        resume,
        getScore,
        publishScore,
        end,
        destroy,
        onStateChange,
    };

    return session;
}
