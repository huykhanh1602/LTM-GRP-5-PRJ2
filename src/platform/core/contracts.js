// Contract / Interface chung cho MỌI game trên Platform.
// Cả game "client" (tự chạy trong trình duyệt) lẫn "server" (engine làm trọng tài)
// đều cài đặt cùng bộ lifecycle hooks này.
// Xem plans/platform-refactoring-plan.md (mục 3.2).

import { GAME_KINDS, GameKind } from "../../shared/protocol/events.js";

// Vòng đời của một phiên chơi (GameSession).
export const LifecycleState = Object.freeze({
    IDLE: "idle",
    RUNNING: "running",
    PAUSED: "paused",
    OVER: "over",
    DESTROYED: "destroyed",
});

// Năng lực mà một game có thể công bố cho Platform.
export const Capabilities = Object.freeze({
    SOLO: "solo",
    MULTIPLAYER: "multiplayer",
    LEADERBOARD: "leaderboard",
    TOURNAMENT: "tournament",
});

// Bộ phương thức bắt buộc của mỗi plugin game.
export const PLUGIN_LIFECYCLE_METHODS = Object.freeze([
    "init",
    "start",
    "pause",
    "resume",
    "destroy",
    "getScore",
    "onGameOver",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function isComponentType(value) {
    return value != null && (typeof value === "function" || typeof value === "object");
}

/**
 * @typedef {Object} GameManifest
 * @property {string} id           // slug, ví dụ "rps-arena"
 * @property {string} name         // tên hiển thị
 * @property {string} [description]
 * @property {string} [icon]
 * @property {"client"|"server"} kind
 * @property {string} [version]
 * @property {string[]} [capabilities]
 * @property {() => Promise<GamePlugin|{default: GamePlugin}>} load
 */

export function validateManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        return { ok: false, errors: ["Manifest không phải object."] };
    }
    const errors = [];
    if (typeof manifest.id !== "string" || !ID_PATTERN.test(manifest.id)) {
        errors.push("Manifest.id phải là slug chữ thường (a-z, 0-9, gạch ngang), ví dụ rps-arena.");
    }
    if (typeof manifest.name !== "string" || !manifest.name.trim()) {
        errors.push("Manifest.name không được rỗng.");
    }
    if (!GAME_KINDS.includes(manifest.kind)) {
        errors.push(`Manifest.kind phải là một trong: ${GAME_KINDS.join(", ")}.`);
    }
    if (typeof manifest.load !== "function") {
        errors.push("Manifest.load phải là hàm nạp module (dynamic import).");
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Kiểm tra một plugin có cài đủ Contract không.
 * @param {object} plugin
 * @param {GameManifest} [manifest]
 */
export function validatePlugin(plugin, manifest = {}) {
    if (!plugin || typeof plugin !== "object") {
        return { ok: false, errors: ["Plugin không phải object."] };
    }
    const errors = [];
    for (const method of PLUGIN_LIFECYCLE_METHODS) {
        if (typeof plugin[method] !== "function") {
            errors.push(`Plugin thiếu phương thức ${method}().`);
        }
    }
    const kind = manifest.kind ?? plugin.manifest?.kind;
    if (kind === GameKind.CLIENT && !isComponentType(plugin.Component)) {
        errors.push("Game client phải cung cấp Component.");
    }
    if (kind === GameKind.SERVER && !isComponentType(plugin.Viewer)) {
        errors.push("Game server phải cung cấp Viewer.");
    }
    return { ok: errors.length === 0, errors };
}

export function assertManifest(manifest) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) throw new TypeError("Game manifest không hợp lệ: " + errors.join(" "));
    return manifest;
}

export function assertPlugin(plugin, manifest) {
    const { ok, errors } = validatePlugin(plugin, manifest);
    if (!ok) throw new TypeError(`Game plugin không hợp lệ: ${errors.join(" ")}`);
    return plugin;
}

/**
 * Lớp cơ sở tiện dụng: game chỉ cần override những gì mình dùng.
 * Các game dùng React có thể chỉ cài `init/start/getScore` và khai báo `Component`.
 */
export class BaseGamePlugin {
    constructor(manifest = {}) {
        this.manifest = manifest;
        this.context = null;
        this._onGameOver = null;
    }

    async init(context) {
        this.context = context ?? null;
    }

    async start() {}

    pause() {}

    resume() {}

    destroy() {
        this._onGameOver = null;
    }

    getScore() {
        throw new Error(`Game "${this.manifest?.id ?? "unknown"}" chưa cài đặt getScore().`);
    }

    onGameOver(callback) {
        this._onGameOver = typeof callback === "function" ? callback : null;
    }

    // Dùng cho plugin con để báo kết thúc ván.
    emitGameOver(event) {
        this._onGameOver?.(event ?? {});
    }
}
