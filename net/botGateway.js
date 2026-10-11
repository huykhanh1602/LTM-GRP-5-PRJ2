import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

import { createRegistry } from "./registry.js";

import {
MESSAGE_TYPES,
ERROR_CODES,
parseMessage,
serializeMessage,
validateClientMessage,
} from "./protocol.js";

// Danh sách token tạm thời do server cấp.
const BOT_TOKENS = {
"token-team-a": {
roomId: "room-01",
team: "A",
},
"token-team-b": {
roomId: "room-01",
team: "B",
},
};

export function createBotGateway(
server,
registry = createRegistry()
) {
// Tạo WebSocket server riêng cho bot.
// Việc phân luồng kết nối được thực hiện tại index.js.
const wss = new WebSocketServer({
noServer: true,
});

let onBotRegistered = null;

function setBotRegisteredHandler(handler) {
    onBotRegistered = handler;
}

wss.on("connection", (socket) => {
    console.log("botGateway nhận được kết nối bot");

    // ID bot sẽ được gán sau khi đăng ký thành công.
    let currentBotId = null;

    // Xử lý thông điệp do bot gửi đến.
    socket.on("message", (rawData) => {
        console.log(
            "Bot gửi đến server:",
            rawData.toString()
        );

        // Bước 1: Phân tích dữ liệu JSON.
        const parsed = parseMessage(rawData);

        if (!parsed.ok) {
            socket.send(
                serializeMessage({
                    type: MESSAGE_TYPES.ERROR,
                    code: ERROR_CODES.INVALID_MESSAGE,
                })
            );
            return;
        }

        // Bước 2: Kiểm tra cấu trúc thông điệp.
        const validation = validateClientMessage(
            parsed.message
        );

        if (!validation.ok) {
            socket.send(
                serializeMessage({
                    type: MESSAGE_TYPES.ERROR,
                    code: validation.error,
                })
            );
            return;
        }

        const message = validation.message;

        // Bước 3: Xử lý yêu cầu đăng ký bot.
        if (message.type === MESSAGE_TYPES.JOIN) {
            // Mỗi kết nối chỉ được đăng ký một lần.
            if (currentBotId !== null) {
                socket.send(
                    serializeMessage({
                        type: MESSAGE_TYPES.ERROR,
                        code: ERROR_CODES.INVALID_MESSAGE,
                    })
                );
                return;
            }

            // Kiểm tra token do bot gửi.
            const botConfig = BOT_TOKENS[message.token];

            if (!botConfig) {
                socket.send(
                    serializeMessage({
                        type: MESSAGE_TYPES.ERROR,
                        code: ERROR_CODES.INVALID_TOKEN,
                    })
                );
                return;
            }

            // Tạo ID riêng cho bot.
            const botId = randomUUID();

            // Yêu cầu registry thêm bot vào phòng.
            const added = registry.addBot(botId, {
                roomId: botConfig.roomId,
                team: botConfig.team,
                socket,
            });

            // Registry từ chối nếu phòng đầy hoặc đội đã có bot.
            if (!added.ok) {
                socket.send(
                    serializeMessage({
                        type: MESSAGE_TYPES.ERROR,
                        code: added.reason,
                    })
                );
                return;
            }

            // Lưu ID sau khi đăng ký thành công.
            currentBotId = botId;

            // Thông báo đăng ký thành công cho bot.
            socket.send(
                serializeMessage({
                    type: MESSAGE_TYPES.JOINED,
                    botId,
                    roomId: botConfig.roomId,
                    team: botConfig.team,
                })
            );

            if (onBotRegistered) {
                const result = onBotRegistered(botConfig.roomId);
                console.log("Kết quả kiểm tra bắt đầu trận:", result);
            }

            console.log(
                `Bot ${botId} đã đăng ký phòng ${botConfig.roomId}, đội ${botConfig.team}`
            );

            return;
        }

        // Các thông điệp khác yêu cầu bot phải đăng ký trước.
        if (currentBotId === null) {
            socket.send(
                serializeMessage({
                    type: MESSAGE_TYPES.ERROR,
                    code: ERROR_CODES.NOT_REGISTERED,
                })
            );
            return;
        }

        // Xử lý MOVE và các thông điệp khác
        // sẽ được bổ sung ở bước tiếp theo.
    });

    // Khi bot ngắt kết nối, xóa bot khỏi registry.
    socket.on("close", () => {
        if (currentBotId !== null) {
            registry.removeBot(currentBotId);

            console.log(
                `Bot ${currentBotId} đã ngắt kết nối`
            );
        }
    });

    // Ghi nhận lỗi kết nối WebSocket.
    socket.on("error", (error) => {
        console.error(
            "Bot WebSocket error:",
            error.message
        );
    });
});

// Chỉ chấp nhận kết nối bot tại đường dẫn /bot.
function handleUpgrade(request, socket, head) {
    const pathname = new URL(
        request.url,
        "http://localhost"
    ).pathname;

    console.log(
        "botGateway nhận upgrade:",
        pathname
    );

    if (pathname !== "/bot") {
        return false;
    }

    wss.handleUpgrade(
        request,
        socket,
        head,
        (ws) => {
            wss.emit("connection", ws, request);
        }
    );

    return true;
}

return {
    wss,
    registry,
    handleUpgrade,
    setBotRegisteredHandler,
};

}
