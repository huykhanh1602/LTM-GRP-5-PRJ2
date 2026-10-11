import {
    MESSAGE_TYPES,
    serializeMessage,
} from "./protocol.js";

export function createRemoteBot(botId, botInfo) {
    const { socket } = botInfo;

    // Kiểm tra bot còn kết nối WebSocket hay không.
    function isConnected() {
        return socket.readyState === 1;
    }

    // Gửi một thông điệp JSON đến bot.
    function send(message) {
        if (!isConnected()) {
            return false;
        }

        try {
            socket.send(serializeMessage(message));
            return true;
        } catch (error) {
            console.error(
                `Không thể gửi thông điệp đến bot ${botId}:`,
                error.message
            );

            return false;
        }
    }

    // Yêu cầu bot thực hiện lượt chơi.
    function requestTurn(state) {
        return send({
            type: MESSAGE_TYPES.YOUR_TURN,
            state,
        });
    }

    // Gửi trạng thái hiện tại của trận đấu.
    function sendGameState(state) {
        return send({
            type: MESSAGE_TYPES.GAME_STATE,
            state,
        });
    }

    // Thông báo kết quả kết thúc trận đấu.
    function sendGameOver(result) {
        return send({
            type: MESSAGE_TYPES.GAME_OVER,
            result,
        });
    }

    return {
        botId,
        isConnected,
        send,
        requestTurn,
        sendGameState,
        sendGameOver,
    };
}