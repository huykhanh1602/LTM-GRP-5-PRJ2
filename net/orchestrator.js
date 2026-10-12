import { createRuleManager } from "./ruleManager.js";

export function createOrchestrator(registry, spectatorGateway, matchStore = null) {
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
            matchId: room.matchId ?? null,
            status: room.status,
            currentTurn: room.currentTurn,
            state: room.state,
        });
    }

    // Bắt đầu trận đấu khi phòng đã có đủ hai bot.
    function startRoom(roomId, initialState = null, options = {}) {
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

        if (matchStore) {
            // Arrival order must not swap the two sides in stored replay data.
            const bots = [...getRoomBots(roomId)].sort((a, b) => a.team.localeCompare(b.team));
            const team = bot => ({ id: bot.teamId ?? bot.team, name: bot.teamName ?? bot.team });
            const match = matchStore.startMatch({ roomId, teamA: team(bots[0]), teamB: team(bots[1]),
                initialState, config: options.config ?? {}, ranked: options.ranked ?? true });
            room.matchId = match.id;
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
            matchId: room.matchId ?? null,
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
            matchId: room.matchId ?? null,
            state: room.state,
            status: room.status,
            currentTurn: room.currentTurn,
        };
    }

    // Cập nhật trạng thái chính thức và phát cho người xem.
    function updateRoomState(roomId, newState, currentTurn = null, turnRecord = null) {
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

        // Only record an accepted move; UI refreshes are not turns.
        if (matchStore && room.matchId && turnRecord) {
            matchStore.appendTurn(room.matchId, { ...turnRecord, state: newState });
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

        if (!room || room.status !== 'playing') {
            return false;
        }

        if (matchStore && room.matchId) matchStore.finishMatch(room.matchId, result, room.state);
        room.status = "stopped";
        room.currentTurn = null;

        // Thông báo trạng thái cuối cùng cho người xem.
        broadcastRoomState(roomId, {
            type: "game_over",
            roomId,
            matchId: room.matchId ?? null,
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
