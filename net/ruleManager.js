
/**
 * Quản lý việc kiểm tra nước đi và kết quả trận đấu.
 *
 * Luật cụ thể sẽ được bổ sung sau khi nhóm thống nhất protocol.
 */

export function createRuleManager() {
    // Kiểm tra nước đi có hợp lệ theo luật chơi hay không.
    function validateMove(context) {
        if (!context || typeof context !== "object") {
            return {
                valid: false,
                reason: "INVALID_CONTEXT",
            };
        }

        // TODO:
        // 1. Kiểm tra cấu trúc nước đi.
        // 2. Kiểm tra nước đi có hợp lệ theo luật.
        // 3. Kiểm tra trạng thái bàn chơi hiện tại.

        return {
            valid: false,
            reason: "RULES_NOT_CONFIGURED",
        };
    }

    // Áp dụng nước đi vào trạng thái trận đấu.
    function applyMove(state, move) {
        // Chưa thay đổi state khi luật chơi chưa được định nghĩa.
        return {
            ok: false,
            reason: "RULES_NOT_CONFIGURED",
            state,
            move,
        };
    }

    // Kiểm tra trận đấu đã kết thúc chưa.
    function checkGameOver(state) {
        // TODO: Bổ sung điều kiện thắng, thua hoặc hòa.
        return {
            over: false,
            reason: "RULES_NOT_CONFIGURED",
        };
    }

    return {
        validateMove,
        applyMove,
        checkGameOver,
    };
}