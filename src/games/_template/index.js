// Game MẪU (client) — điểm khởi đầu để tạo game mới.
// Cách dùng: sao chép cả thư mục này, đổi id/name, rồi thêm vào
// src/games/registry.js. Xem README.md cùng thư mục.

import { BaseGamePlugin, Capabilities } from "../../platform/core/contracts.js";
import { GameKind } from "../../shared/protocol/events.js";
import TapCounterView from "./GameComponent.jsx";
import {
    begin,
    createGameState,
    finish,
    isFinished,
    playtimeOf,
    registerTap,
    scoreOf,
} from "./logic.js";

export const manifest = {
    id: "tap-counter",
    name: "Tap Counter",
    description: "Game mẫu: bấm nút càng nhiều lần càng tốt trong 20 giây.",
    kind: GameKind.CLIENT,
    version: "1.0.0",
    capabilities: [Capabilities.SOLO, Capabilities.LEADERBOARD],
    // Registry gọi hàm này để lấy plugin. Đã import sẵn -> trả về singleton.
    load: async () => plugin,
};

class TapCounterPlugin extends BaseGamePlugin {
    constructor() {
        super(manifest);
        this.Component = TapCounterView;
        this.state = createGameState();
        this.listeners = new Set();
        this.player = { id: "local", name: "Bạn" };
        this.paused = false;
    }

    async init(context) {
        await super.init(context);
        this.player = {
            id: context?.playerId ?? "local",
            name: context?.playerName ?? "Bạn",
        };
        return this;
    }

    async start() {
        this.paused = false;
        this.state = begin(createGameState(), Date.now());
        this.notify();
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    destroy() {
        super.destroy();
        this.listeners.clear();
    }

    // Contract: trả phần thô; GameSession sẽ gắn thêm gameId + timestamp.
    getScore() {
        return {
            playerId: this.player.id,
            playerName: this.player.name,
            score: scoreOf(this.state),
            playtimeMs: playtimeOf(this.state),
        };
    }

    // ---- API dành riêng cho view ----
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getState() {
        return this.state;
    }

    tap() {
        if (this.paused || isFinished(this.state)) return;
        this.state = registerTap(this.state);
        this.notify();
    }

    /** View gọi định kỳ để kiểm tra hết giờ. */
    syncClock(now = Date.now()) {
        if (isFinished(this.state, now) && this.state.endedAt == null) {
            this.timeUp(now);
        } else {
            this.notify();
        }
    }

    timeUp(now = Date.now()) {
        this.state = finish(this.state, now);
        this.notify();
        this.emitGameOver({
            players: [this.player.id],
            winnerId: this.player.id,
            reason: "TIME_UP",
        });
    }

    notify() {
        for (const listener of [...this.listeners]) listener(this.state);
    }
}

const plugin = new TapCounterPlugin();

export default plugin;
