import { createRuleManager } from "./ruleManager.js";

export function createOrchestrator(registry, spectatorGateway) {
    const ruleManager = createRuleManager();

    // Lưu các trận đấu đang được quản lý.
    const rooms = new Map();

    // Lấy danh sách bot trong một phòng.
    function getRoomBots(roomId) {
        return registry.listBots(roomId);
    }

    // Lấy phòng hiện có hoặc tạo phòng mới.
    function getRoom(roomId) {
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                roomId,
                state: null,
                status: "waiting",
                currentTurn: null,
            });
        }

        return rooms.get(roomId);
    }

    // Kiểm tra phòng đã có đủ hai bot chưa.
    function getRoomStatus(roomId) {
        const bots = getRoomBots(roomId);

        return {
            roomId,
            botCount: bots.length,
            ready: bots.length === 2,
            bots: bots.map((bot) => ({
                botId: bot.botId,
                team: bot.team,
            })),
        };
    }

    // Gửi thông điệp đến người xem trong phòng.
    function broadcastRoomState(roomId, message) {
        if (!spectatorGateway) {
            return 0;
        }

        return spectatorGateway.broadcastToRoom(
            roomId,
            message
        );
    }

    // Phát trạng thái hiện tại của trận đấu.
    function publishRoomState(roomId) {
        const room = rooms.get(roomId);

        if (!room) {
            return 0;
        }

        return broadcastRoomState(roomId, {
            type: "game_state",
            roomId: room.roomId,
            status: room.status,
            currentTurn: room.currentTurn,
            state: room.state,
        });
    }

    // Bắt đầu trận đấu khi phòng đã có đủ hai bot.
    function startRoom(roomId, initialState = null) {
        const roomStatus = getRoomStatus(roomId);

        if (!roomStatus.ready) {
            return {
                ok: false,
                reason: "ROOM_NOT_READY",
            };
        }

        const room = getRoom(roomId);

        if (room.status === "playing") {
            return {
                ok: false,
                reason: "ROOM_ALREADY_PLAYING",
            };
        }

        room.state = initialState;
        room.status = "playing";
        room.currentTurn = null;

        // Thông báo trạng thái ban đầu cho người xem.
        publishRoomState(roomId);

        return {
            ok: true,
            roomId,
            status: room.status,
        };
    }

    // Lấy thông tin phòng để các thành phần khác sử dụng.
    function getRoomInfo(roomId) {
        const room = rooms.get(roomId);

        if (!room) {
            return null;
        }

        return {
            roomId: room.roomId,
            state: room.state,
            status: room.status,
            currentTurn: room.currentTurn,
        };
    }

    // Cập nhật trạng thái chính thức và phát cho người xem.
    function updateRoomState(roomId, newState, currentTurn = null) {
        const room = rooms.get(roomId);

        if (!room) {
            return {
                ok: false,
                reason: "ROOM_NOT_FOUND",
            };
        }

        if (room.status !== "playing") {
            return {
                ok: false,
                reason: "ROOM_NOT_PLAYING",
            };
        }

        room.state = newState;
        room.currentTurn = currentTurn;

        const spectatorsSent = publishRoomState(roomId);

        return {
            ok: true,
            roomId,
            spectatorsSent,
        };
    }

    // Kết thúc trận đấu.
    function stopRoom(roomId, result = null) {
        const room = rooms.get(roomId);

        if (!room) {
            return false;
        }

        room.status = "stopped";
        room.currentTurn = null;

        // Thông báo trạng thái cuối cùng cho người xem.
        broadcastRoomState(roomId, {
            type: "game_over",
            roomId,
            result,
            state: room.state,
        });

        return true;
    }

    function onBotRegistered(roomId) {
    const roomStatus = getRoomStatus(roomId);

    // Chưa đủ hai đội thì tiếp tục chờ.
    if (!roomStatus.ready) {
        return {
            ok: true,
            started: false,
            reason: "WAITING_FOR_OPPONENT",
        };
    }

    const room = getRoom(roomId);

    // Không khởi động lại trận đang diễn ra.
    if (room.status === "playing") {
        return {
            ok: true,
            started: false,
            reason: "ROOM_ALREADY_PLAYING",
        };
    }

    // Tạm thời chưa khởi tạo bàn cờ vì luật chơi chưa được xác định.
    const result = startRoom(roomId, null);

    if (result.ok) {
        console.log(`Phòng ${roomId} tự động bắt đầu trận đấu.`);
    }

    return {
        ...result,
        started: result.ok,
    };
}

    return {
        getRoomBots,
        getRoomStatus,
        getRoom,
        startRoom,
        getRoomInfo,
        updateRoomState,
        publishRoomState,
        broadcastRoomState,
        stopRoom,
        ruleManager,
        onBotRegistered,
    };
}