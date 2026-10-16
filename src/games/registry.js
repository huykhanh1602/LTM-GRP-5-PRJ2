// Danh sách game có sẵn của Platform.
// Thêm game mới = thêm một manifest vào BUILTIN_GAMES.
// Không sửa core hay Shell UI.
//
// LƯU Ý: game server (như rps-arena) sẽ được thêm ở Phase B của kế hoạch.

import { manifest as tapCounterManifest } from "./_template/index.js";

export const BUILTIN_GAMES = Object.freeze([tapCounterManifest]);

/**
 * Đăng ký toàn bộ game có sẵn vào một GameRegistry.
 * @param {ReturnType<import("../platform/core/GameRegistry.js").createGameRegistry>} registry
 */
export function registerBuiltinGames(registry) {
    return registry.registerAll(BUILTIN_GAMES);
}
