// Tên sự kiện CHUẨN của Platform.
// Game phát ra, Platform lắng nghe. Giá trị trùng tên hằng để dễ đọc log / grep.
// Xem plans/platform-refactoring-plan.md (mục 3.3).

export const Events = Object.freeze({
    PLATFORM_READY: "PLATFORM_READY",
    GAME_REGISTERED: "GAME_REGISTERED",
    GAME_LAUNCHED: "GAME_LAUNCHED",
    GAME_STARTED: "GAME_STARTED",
    GAME_PAUSED: "GAME_PAUSED",
    GAME_RESUMED: "GAME_RESUMED",
    SCORE_UPDATED: "SCORE_UPDATED",
    GAME_OVER: "GAME_OVER",
    GAME_DESTROYED: "GAME_DESTROYED",
    MATCH_STARTED: "MATCH_STARTED",
    MATCH_ENDED: "MATCH_ENDED",
    ROOM_STATE: "ROOM_STATE",
});

// Đăng ký kênh nghe tất cả sự kiện.
export const WILDCARD = "*";

// Hai loại game mà Platform hỗ trợ dưới cùng một Contract.
export const GameKind = Object.freeze({
    CLIENT: "client", // game tự chạy trong trình duyệt (React/Canvas)
    SERVER: "server", // game do engine server làm trọng tài (bot arena)
});

export const GAME_KINDS = Object.freeze([GameKind.CLIENT, GameKind.SERVER]);

export function isPlatformEvent(name) {
    return typeof name === "string" && Object.prototype.hasOwnProperty.call(Events, name);
}
