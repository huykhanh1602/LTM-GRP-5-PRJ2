import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

import { createRegistry } from "./registry.js";

import {
    MESSAGE_TYPES,
    ERROR_CODES,
    parseMessage,
    serializeMessage,
} from "./protocol.js";

export function createSpectatorGateway(
    server,
    registry = createRegistry()
) {
    const wss = new WebSocketServer({
        noServer: true,
    });

    // Hàm lấy trạng thái phòng sẽ được kết nối từ orchestrator.
    let getRoomInfo = null;

    function setRoomInfoProvider(provider) {
        getRoomInfo = provider;
    }

    // Xử lý kết nối của người xem.
    wss.on("connection", (socket) => {
        console.log("Có khán giả kết nối");

        let spectatorId = null;

        socket.on("message", (rawData) => {
            // Phân tích thông điệp JSON.
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

            const message = parsed.message;

            // Chỉ chấp nhận yêu cầu JOIN hợp lệ một lần.
            if (
                spectatorId !== null ||
                message.type !== MESSAGE_TYPES.JOIN ||
                typeof message.roomId !== "string" ||
                message.roomId.trim() === ""
            ) {
                socket.send(
                    serializeMessage({
                        type: MESSAGE_TYPES.ERROR,
                        code: ERROR_CODES.INVALID_MESSAGE,
                    })
                );
                return;
            }

            const roomId = message.roomId.trim();
            const newSpectatorId = randomUUID();

            // Đăng ký người xem vào registry.
            const added = registry.addSpectator(
                newSpectatorId,
                {
                    roomId,
                    socket,
                }
            );

            if (!added) {
                socket.send(
                    serializeMessage({
                        type: MESSAGE_TYPES.ERROR,
                        code: ERROR_CODES.REGISTRATION_FAILED,
                    })
                );
                return;
            }

            spectatorId = newSpectatorId;

            // Xác nhận đăng ký thành công.
            socket.send(
                serializeMessage({
                    type: MESSAGE_TYPES.JOINED,
                    spectatorId,
                    roomId,
                    role: "spectator",
                })
            );

            console.log(
                `Khán giả ${spectatorId} đang theo dõi phòng ${roomId}`
            );

            // Gửi trạng thái hiện tại ngay sau khi tham gia.
            if (getRoomInfo) {
                const room = getRoomInfo(roomId);

                if (room !== null) {
                    socket.send(
                        serializeMessage({
                            type: MESSAGE_TYPES.GAME_STATE,
                            roomId: room.roomId,
                            status: room.status,
                            currentTurn: room.currentTurn,
                            state: room.state,
                        })
                    );
                }
            }
        });

        // Xóa người xem khi họ ngắt kết nối.
        socket.on("close", () => {
            if (spectatorId !== null) {
                registry.removeSpectator(spectatorId);

                console.log(
                    `Khán giả ${spectatorId} đã ngắt kết nối`
                );
            }
        });

        socket.on("error", (error) => {
            console.error(
                "Spectator WebSocket error:",
                error.message
            );
        });
    });

    // Chỉ tiếp nhận WebSocket tại /spectator.
    function handleUpgrade(request, socket, head) {
        const pathname = new URL(
            request.url,
            "http://localhost"
        ).pathname;

        if (pathname !== "/spectator") {
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

    // Gửi thông điệp tới tất cả người xem trong một phòng.
    function broadcastToRoom(roomId, message) {
        const spectators = registry.listSpectators(roomId);
        const serialized = serializeMessage(message);

        let sentCount = 0;

        for (const spectator of spectators) {
            if (spectator.socket.readyState === 1) {
                spectator.socket.send(serialized);
                sentCount++;
            }
        }

        return sentCount;
    }

    return {
        wss,
        registry,
        handleUpgrade,
        broadcastToRoom,
        setRoomInfoProvider,
    };
}