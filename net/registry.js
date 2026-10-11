export function createRegistry() {
const bots = new Map();
const spectators = new Map();

// Thêm bot vào phòng.
function addBot(botId, botInfo) {
    // Không cho phép trùng botId.
    if (bots.has(botId)) {
        return { ok: false, reason: "BOT_ID_ALREADY_EXISTS" };
    }

    // Lấy danh sách bot hiện có trong phòng.
    const roomBots = listBots(botInfo.roomId);

    // Mỗi phòng chỉ có tối đa 2 bot.
    if (roomBots.length >= 2) {
        return { ok: false, reason: "ROOM_FULL" };
    }

    // Mỗi đội chỉ có một bot trong cùng một phòng.
    const teamExists = roomBots.some(
        (bot) => bot.team === botInfo.team
    );

    if (teamExists) {
        return { ok: false, reason: "TEAM_ALREADY_REGISTERED" };
    }

    // Chỉ thêm bot khi tất cả điều kiện đều hợp lệ.
    bots.set(botId, botInfo);

    return { ok: true };
}

function getBot(botId) {
    return bots.get(botId) ?? null;
}

function removeBot(botId) {
    return bots.delete(botId);
}

function listBots(roomId) {
    return [...bots.entries()]
        .filter(([, bot]) => bot.roomId === roomId)
        .map(([botId, bot]) => ({ botId, ...bot }));
}

function addSpectator(spectatorId, spectatorInfo) {
    if (spectators.has(spectatorId)) {
        return false;
    }

    spectators.set(spectatorId, spectatorInfo);
    return true;
}

function getSpectator(spectatorId) {
    return spectators.get(spectatorId) ?? null;
}

function removeSpectator(spectatorId) {
    return spectators.delete(spectatorId);
}

function listSpectators(roomId) {
    return [...spectators.entries()]
        .filter(([, spectator]) => spectator.roomId === roomId)
        .map(([spectatorId, spectator]) => ({
            spectatorId,
            ...spectator,
        }));
}

return {
    addBot,
    getBot,
    removeBot,
    listBots,
    addSpectator,
    getSpectator,
    removeSpectator,
    listSpectators,
};


}
