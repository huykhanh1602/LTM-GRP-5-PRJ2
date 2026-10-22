import { createHash, randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { validateBotSource } from "./botValidator.js";
import { runEngineMatch } from "./engineRunner.js";
import { createMatchQueue } from "./matchmaking/queue.js";
import { createRatingStore } from "./matchmaking/ratings.js";

// Giao thức WebSocket v2: xem docs/WS_PROTOCOL_V2.md.
// Một kết nối /ws phục vụ đăng nhập, hàng đợi ghép trận, phòng và xem trận.

export const PROTOCOL_VERSION = 2;
const TEAM_IDS = ["team_a", "team_b"];
const MODES = ["casual", "ranked", "tournament"];
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BOT_BYTES = 100 * 1024;

// Danh sách game đang bật. `config` là các khóa người tạo phòng casual được chỉnh (kèm khoảng cho phép).
const GAMES = {
    rps_chess: {
        defaultConfig: { max_turns: 100, bot_time_ms: 1000 },
        limits: { max_turns: [1, 300], bot_time_ms: [100, 5000] },
    },
};

function send(conn, message) {
    if (conn?.socket.readyState === 1) conn.socket.send(JSON.stringify({ ...message, v: PROTOCOL_VERSION }));
}

function sendError(conn, code, message = "") {
    send(conn, { type: "error", code, message });
}

function makeSlot(teamId) {
    return {
        teamId,
        userId: null,
        displayName: "",
        conn: null,
        connected: false,
        hasBot: false,
        filename: null,
        source: null,
        version: 0,
        ready: false,
        graceTimer: null,
    };
}

export function createWsGateway({
    sessions,
    users,
    ratings = createRatingStore(),
    ratingService = null,
    queue = createMatchQueue(),
    runMatch = runEngineMatch,
    validateBot = validateBotSource,
    matchStore = null,
    countdownMs = 1000,
    graceMs = 30000,
    authTimeoutMs = 10000,
    sweepMs = 1000,
    queueStateEveryMs = 2000,
    maxMessagesPerSecond = 30,
    allowGuestRanked = process.env.ALLOW_GUEST_RANKED === "1",
} = {}) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
    const rooms = new Map();
    const connections = new Map(); // userId -> conn đang hoạt động
    const userRoom = new Map(); // userId -> room mà người đó đang giữ chỗ
    let sweepTimer = null;
    let lastQueueStateAt = 0;

    // ------------------------------------------------------------------ phòng
    function newRoomCode() {
        for (let attempt = 0; attempt < 200; attempt++) {
            let code = "";
            for (let i = 0; i < 4; i++) code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
            if (!rooms.has(code)) return code;
        }
        throw new Error("Không còn mã phòng trống.");
    }

    function createRoom({ gameId, mode, config, reserved = null }) {
        const room = {
            code: newRoomCode(),
            gameId,
            mode,
            config,
            status: "waiting",
            players: TEAM_IDS.map(makeSlot),
            spectators: new Set(),
            reserved, // ranked/tournament: chỉ những userId này được vào
            matchId: null,
            liveEvents: [],
            countdownTimer: null,
            countdownToken: 0,
            runToken: 0,
        };
        rooms.set(room.code, room);
        return room;
    }

    const slotOf = (room, userId) => room.players.find((slot) => slot.userId === userId) ?? null;

    function roomStateMessage(room) {
        return {
            type: "room_state",
            room_id: room.code,
            game_id: room.gameId,
            mode: room.mode,
            status: room.status,
            config: room.config,
            players: room.players
                .filter((slot) => slot.userId)
                .map((slot) => ({
                    user_id: slot.userId,
                    display_name: slot.displayName,
                    team_id: slot.teamId,
                    has_bot: slot.hasBot,
                    filename: slot.filename,
                    ready: slot.ready,
                    connected: slot.connected,
                })),
            spectators: room.spectators.size,
        };
    }

    function recipients(room) {
        return [...room.players.map((slot) => slot.conn), ...room.spectators].filter(Boolean);
    }

    function broadcast(room, message) {
        for (const conn of recipients(room)) send(conn, message);
    }

    const broadcastRoom = (room) => broadcast(room, roomStateMessage(room));

    function destroyIfEmpty(room) {
        const occupied = room.players.some((slot) => slot.userId) || room.spectators.size > 0;
        if (occupied || room.status === "playing") return;
        clearTimeout(room.countdownTimer);
        rooms.delete(room.code);
    }

    function freeSlot(room, slot) {
        clearTimeout(slot.graceTimer);
        if (slot.userId && userRoom.get(slot.userId) === room) userRoom.delete(slot.userId);
        Object.assign(slot, makeSlot(slot.teamId));
    }

    function cancelCountdown(room) {
        room.countdownToken++;
        clearTimeout(room.countdownTimer);
        room.countdownTimer = null;
        if (room.status === "countdown") {
            room.status = "waiting";
            broadcast(room, { type: "countdown", seconds: null });
        }
    }

    function resetFinished(room) {
        if (room.status !== "finished") return;
        room.status = "waiting";
        room.players.forEach((slot) => { slot.ready = false; });
        room.liveEvents = [];
    }

    // -------------------------------------------------------------- bắt đầu trận
    async function startMatch(room, token) {
        if (token !== room.countdownToken || room.status !== "countdown") return;

        room.status = "playing";
        room.countdownTimer = null;
        room.liveEvents = [];
        const runToken = ++room.runToken;
        const startedAt = new Date().toISOString();
        const [slotA, slotB] = room.players;
        const ids = [slotA.userId, slotB.userId];
        broadcast(room, { type: "countdown", seconds: null });
        broadcastRoom(room);

        const emit = (message) => {
            room.liveEvents.push(message);
            broadcast(room, message);
        };

        try {
            const replay = await runMatch({
                roomCode: room.code,
                teamA: { name: slotA.displayName, code: slotA.source },
                teamB: { name: slotB.displayName, code: slotB.source },
                configPatch: { limits: room.config },
                onEvent(message) {
                    if (runToken !== room.runToken) return;
                    if (message.type === "match_start") {
                        room.matchId = message.match_info?.match_id ?? null;
                        const { type: _type, ...rest } = message;
                        emit({ type: "match_start", match_id: room.matchId, game_id: room.gameId, mode: room.mode, ...rest });
                    } else if (message.type === "turn") {
                        emit(message);
                    } else if (message.type === "match_end") {
                        room.status = "finished";
                        room.players.forEach((slot) => { slot.ready = false; });
                        const winner = message.winner === "team_a" || message.winner === "team_b" ? message.winner : "draw";
                        const over = { type: "game_over", match_id: room.matchId, winner, reason: message.reason ?? null };
                        if (room.mode === "ranked" && ids[0] && ids[1]) {
                            const outcome = winner === "team_a" ? "a" : winner === "team_b" ? "b" : "draw";
                            if (ratingService) {
                                ratingService.applyMatchResult({
                                    matchId: room.matchId,
                                    gameId: room.gameId,
                                    participants: { a: { userId: ids[0] }, b: { userId: ids[1] } },
                                    outcome,
                                    reason: message.reason ?? null,
                                }).then((result) => {
                                    if (result?.applied) {
                                        over.elo_change_a = result.a.change;
                                        over.elo_change_b = result.b.change;
                                    }
                                }).catch((error) => {
                                    console.error("RatingService error:", error.message);
                                });
                            } else {
                                const result = ratings.applyResult({
                                    gameId: room.gameId,
                                    userA: ids[0],
                                    userB: ids[1],
                                    winner: outcome,
                                });
                                over.elo_change_a = result.a.change;
                                over.elo_change_b = result.b.change;
                            }
                        }
                        emit(over);
                        broadcastRoom(room);
                    }
                },
            });

            if (runToken === room.runToken && room.status === "playing") {
                throw new Error("Engine kết thúc mà không gửi kết quả trận.");
            }
            if (matchStore) {
                try {
                    await matchStore.importReplay(replay, {
                        roomId: room.code,
                        ranked: room.mode === "ranked",
                        teamAId: ids[0],
                        teamBId: ids[1],
                        startedAt,
                        endedAt: new Date().toISOString(),
                    });
                } catch (error) {
                    console.error("Không lưu được replay:", error.message);
                }
            }
        } catch (error) {
            if (runToken !== room.runToken) return;
            room.status = "waiting";
            room.players.forEach((slot) => { slot.ready = false; });
            broadcastRoom(room);
            broadcast(room, { type: "error", code: "MATCH_FAILED", message: `Không thể chạy trận đấu: ${error.message}`, v: PROTOCOL_VERSION });
        }
    }

    function beginCountdown(room) {
        if (room.status !== "waiting" || !room.players.every((slot) => slot.userId && slot.connected && slot.hasBot && slot.ready)) return;

        room.status = "countdown";
        const token = ++room.countdownToken;
        let seconds = 3;
        broadcastRoom(room);
        broadcast(room, { type: "countdown", seconds });

        const tick = () => {
            if (token !== room.countdownToken || room.status !== "countdown") return;
            seconds--;
            if (seconds === 0) {
                void startMatch(room, token);
                return;
            }
            broadcast(room, { type: "countdown", seconds });
            room.countdownTimer = setTimeout(tick, countdownMs);
        };
        room.countdownTimer = setTimeout(tick, countdownMs);
    }

    // ------------------------------------------------------------ gắn / gỡ kết nối
    function seat(room, conn) {
        const slot = slotOf(room, conn.user.id) ?? room.players.find((candidate) => !candidate.userId);
        if (!slot) return null;
        clearTimeout(slot.graceTimer);
        slot.userId = conn.user.id;
        slot.displayName = conn.user.display_name;
        slot.conn = conn;
        slot.connected = true;
        slot.ready = false;
        userRoom.set(conn.user.id, room);
        conn.room = room;
        return slot;
    }

    function sendCatchUp(conn, room) {
        send(conn, roomStateMessage(room));
        if (room.status === "playing") for (const event of room.liveEvents) send(conn, event);
    }

    function leaveRoom(conn) {
        const room = conn.room;
        if (!room) return;
        conn.room = null;
        if (room.spectators.delete(conn)) {
            destroyIfEmpty(room);
            return;
        }
        const slot = slotOf(room, conn.user?.id);
        if (!slot || slot.conn !== conn) return;
        slot.conn = null;
        slot.connected = false;
        slot.ready = false;
        if (room.status === "countdown") cancelCountdown(room);
        if (room.status !== "playing") broadcastRoom(room);

        // Giữ chỗ graceMs để người chơi vào lại; hết hạn thì nhường chỗ.
        const expire = () => {
            if (slot.connected || !slot.userId) return;
            if (room.status === "playing") {
                slot.graceTimer = setTimeout(expire, graceMs);
                slot.graceTimer.unref?.();
                return;
            }
            freeSlot(room, slot);
            broadcastRoom(room);
            destroyIfEmpty(room);
        };
        slot.graceTimer = setTimeout(expire, graceMs);
        slot.graceTimer.unref?.();
    }

    function dropConnection(conn) {
        if (conn.dropped) return;
        conn.dropped = true;
        clearTimeout(conn.authTimer);
        if (conn.user) {
            if (connections.get(conn.user.id) === conn) connections.delete(conn.user.id);
            queue.remove(conn.user.id);
        }
        leaveRoom(conn);
    }

    // ------------------------------------------------------------ hàng đợi / ghép trận
    function sendQueueState(conn, entry) {
        send(conn, {
            type: "queue_state",
            in_queue: Boolean(entry),
            wait_time: entry ? queue.waitSeconds(entry) : 0,
            mode: entry?.mode ?? null,
            game_id: entry?.gameId ?? null,
        });
    }

    function runMatchmaker() {
        for (const [entryA, entryB] of queue.takePairs()) {
            const connA = connections.get(entryA.userId);
            const connB = connections.get(entryB.userId);
            if (!connA || !connB) {
                // Một bên đã rời: trả bên còn lại về hàng đợi.
                for (const [entry, conn] of [[entryA, connA], [entryB, connB]]) {
                    if (conn) {
                        queue.add({ userId: entry.userId, gameId: entry.gameId, mode: entry.mode, rating: entry.rating });
                    }
                }
                continue;
            }
            const room = createRoom({
                gameId: entryA.gameId,
                mode: entryA.mode,
                config: { ...GAMES[entryA.gameId].defaultConfig },
                reserved: new Set([entryA.userId, entryB.userId]),
            });
            seat(room, connA);
            seat(room, connB);
            for (const [conn, other, otherEntry] of [[connA, connB, entryB], [connB, connA, entryA]]) {
                sendQueueState(conn, null);
                send(conn, {
                    type: "match_found",
                    room_id: room.code,
                    game_id: room.gameId,
                    mode: room.mode,
                    opponent: {
                        id: other.user.id,
                        display_name: other.user.display_name,
                        rating: room.mode === "ranked" ? otherEntry.rating : undefined,
                    },
                });
            }
            broadcastRoom(room);
        }
        if (queue.size === 0 && sweepTimer) {
            clearInterval(sweepTimer);
            sweepTimer = null;
        }
    }

    function ensureSweep() {
        if (sweepTimer) return;
        sweepTimer = setInterval(() => {
            runMatchmaker();
            const nowMs = Date.now();
            if (nowMs - lastQueueStateAt >= queueStateEveryMs) {
                lastQueueStateAt = nowMs;
                for (const entry of queue.entries()) sendQueueState(connections.get(entry.userId), entry);
            }
        }, sweepMs);
        sweepTimer.unref?.();
    }

    // ----------------------------------------------------------------- xử lý tin
    const isGame = (gameId) => typeof gameId === "string" && Object.hasOwn(GAMES, gameId);

    function requireGameAndMode(conn, message, allowedModes) {
        if (!isGame(message.game_id)) return sendError(conn, "UNKNOWN_GAME", "game_id không tồn tại."), false;
        if (!MODES.includes(message.mode)) return sendError(conn, "INVALID_MESSAGE", "mode không hợp lệ."), false;
        if (!allowedModes.includes(message.mode)) return sendError(conn, "MODE_NOT_ALLOWED", `Thao tác này không dùng được ở chế độ ${message.mode}.`), false;
        return true;
    }

    function sanitizeConfig(gameId, raw) {
        const game = GAMES[gameId];
        const config = { ...game.defaultConfig };
        if (raw === undefined || raw === null) return config;
        if (typeof raw !== "object" || Array.isArray(raw)) return null;
        for (const [key, value] of Object.entries(raw)) {
            const range = game.limits[key];
            if (!range) continue; // khóa lạ: bỏ qua
            if (!Number.isInteger(value) || value < range[0] || value > range[1]) return null;
            config[key] = value;
        }
        return config;
    }

    const handlers = {
        ping(conn) {
            send(conn, { type: "pong" });
        },

        async auth(conn, message) {
            if (conn.user) return sendError(conn, "INVALID_MESSAGE", "Đã đăng nhập rồi.");
            const userId = typeof message.token === "string" ? await sessions.resolve(message.token) : null;
            const user = userId ? await users.get(userId) : null;
            if (!user) {
                sendError(conn, "INVALID_TOKEN", "Token không hợp lệ hoặc đã hết hạn.");
                conn.socket.close(1008, "invalid token");
                return;
            }
            clearTimeout(conn.authTimer);

            const previous = connections.get(user.id);
            if (previous && previous !== conn) {
                sendError(previous, "REPLACED", "Tài khoản vừa kết nối ở nơi khác.");
                dropConnection(previous);
                previous.socket.close(4001, "replaced");
            }
            conn.user = user;
            connections.set(user.id, conn);
            send(conn, { type: "auth_ok", user: users.publicUser(user) });

            // Vào lại phòng đang giữ chỗ.
            const room = userRoom.get(user.id);
            const slot = room && slotOf(room, user.id);
            if (room && slot) {
                clearTimeout(slot.graceTimer);
                slot.conn = conn;
                slot.connected = true;
                conn.room = room;
                sendCatchUp(conn, room);
                broadcastRoom(room);
            }
        },

        find_match(conn, message) {
            if (!requireGameAndMode(conn, message, ["casual", "ranked"])) return;
            if (conn.room || userRoom.has(conn.user.id)) return sendError(conn, "ALREADY_IN_ROOM", "Bạn đang ở trong một phòng.");
            if (queue.has(conn.user.id)) return sendError(conn, "ALREADY_QUEUED", "Bạn đang trong hàng đợi.");
            if (message.mode === "ranked" && conn.user.guest && !allowGuestRanked) {
                return sendError(conn, "MODE_NOT_ALLOWED", "Chế độ ranked yêu cầu đăng nhập Google.");
            }
            const entry = queue.add({
                userId: conn.user.id,
                gameId: message.game_id,
                mode: message.mode,
                rating: ratings.get(message.game_id, conn.user.id),
            });
            sendQueueState(conn, entry);
            runMatchmaker();
            if (queue.has(conn.user.id)) ensureSweep();
        },

        cancel_match(conn) {
            if (!queue.remove(conn.user.id)) return sendError(conn, "NOT_QUEUED", "Bạn không ở trong hàng đợi.");
            sendQueueState(conn, null);
        },

        create_room(conn, message) {
            if (!requireGameAndMode(conn, message, ["casual"])) return;
            if (conn.room || userRoom.has(conn.user.id)) return sendError(conn, "ALREADY_IN_ROOM", "Bạn đang ở trong một phòng.");
            queue.remove(conn.user.id);
            const config = sanitizeConfig(message.game_id, message.config);
            if (!config) return sendError(conn, "INVALID_MESSAGE", "config không hợp lệ.");
            const room = createRoom({ gameId: message.game_id, mode: "casual", config });
            seat(room, conn);
            broadcastRoom(room);
        },

        join_room(conn, message) {
            if (!requireGameAndMode(conn, message, MODES)) return;
            if (typeof message.code !== "string" || !/^[A-Z0-9]{4}$/.test(message.code)) {
                return sendError(conn, "INVALID_MESSAGE", "Mã phòng phải gồm 4 ký tự A-Z hoặc 0-9.");
            }
            const room = rooms.get(message.code);
            if (!room || room.gameId !== message.game_id) return sendError(conn, "ROOM_NOT_FOUND", "Phòng không tồn tại.");
            if (room.mode !== message.mode) return sendError(conn, "MODE_NOT_ALLOWED", `Phòng này thuộc chế độ ${room.mode}.`);
            if (room.reserved && !room.reserved.has(conn.user.id)) {
                return sendError(conn, "MODE_NOT_ALLOWED", "Phòng này chỉ dành cho người đã được ghép.");
            }
            if (conn.room && conn.room !== room) return sendError(conn, "ALREADY_IN_ROOM", "Bạn đang ở trong phòng khác.");
            if (userRoom.has(conn.user.id) && userRoom.get(conn.user.id) !== room) {
                return sendError(conn, "ALREADY_IN_ROOM", "Bạn đang giữ chỗ ở phòng khác.");
            }
            if (conn.room === room) return sendCatchUp(conn, room);
            if (!slotOf(room, conn.user.id)) {
                if (room.status === "playing" || room.status === "countdown") {
                    return sendError(conn, "WRONG_STATE", "Trận đã bắt đầu, không thể vào với tư cách người chơi.");
                }
                if (!room.players.some((slot) => !slot.userId)) return sendError(conn, "ROOM_FULL", "Phòng đã đủ hai người.");
            }
            queue.remove(conn.user.id);
            resetFinished(room);
            if (!seat(room, conn)) return sendError(conn, "ROOM_FULL", "Phòng đã đủ hai người.");
            broadcastRoom(room);
        },

        watch_room(conn, message) {
            if (typeof message.code !== "string" || !/^[A-Z0-9]{4}$/.test(message.code)) {
                return sendError(conn, "INVALID_MESSAGE", "Mã phòng phải gồm 4 ký tự A-Z hoặc 0-9.");
            }
            const room = rooms.get(message.code);
            if (!room) return sendError(conn, "ROOM_NOT_FOUND", "Phòng không tồn tại.");
            if (conn.room) return sendError(conn, "ALREADY_IN_ROOM", "Bạn đang ở trong một phòng.");
            queue.remove(conn.user.id);
            room.spectators.add(conn);
            conn.room = room;
            sendCatchUp(conn, room);
            broadcastRoom(room);
        },

        leave_room(conn) {
            const room = conn.room;
            if (!room) return sendError(conn, "NOT_IN_ROOM", "Bạn không ở trong phòng nào.");
            const slot = slotOf(room, conn.user.id);
            if (!slot) {
                leaveRoom(conn); // khán giả
            } else {
                if (room.status === "playing" || room.status === "countdown") {
                    return sendError(conn, "WRONG_STATE", "Không thể rời phòng khi trận đã bắt đầu.");
                }
                conn.room = null;
                freeSlot(room, slot);
                broadcastRoom(room);
                destroyIfEmpty(room);
            }
            send(conn, { type: "room_left" });
        },

        async submit_bot(conn, message) {
            const room = conn.room;
            const slot = room && slotOf(room, conn.user.id);
            if (!slot) return sendError(conn, "NOT_IN_ROOM", "Hãy vào phòng với tư cách người chơi trước khi nộp bot.");
            if (!["code", "file"].includes(message.mode_type)) return sendError(conn, "INVALID_MESSAGE", "mode_type phải là code hoặc file.");
            if (message.language !== "python") return sendError(conn, "UNSUPPORTED_LANGUAGE", "Hiện chỉ hỗ trợ python.");
            if (typeof message.content !== "string" || message.content.trim() === "") return sendError(conn, "INVALID_BOT", "Nội dung bot không được để trống.");
            const bytes = Buffer.byteLength(message.content, "utf8");
            if (bytes > MAX_BOT_BYTES) return sendError(conn, "BOT_TOO_LARGE", "Bot tối đa 100 KB.");
            let filename = "bot.py";
            if (message.mode_type === "file") {
                filename = typeof message.filename === "string" ? message.filename : "";
                if (!/^[A-Za-z0-9_-]{1,50}\.py$/i.test(filename)) return sendError(conn, "INVALID_BOT", "Tên file bot phải kết thúc bằng .py.");
            }
            if (room.status === "countdown" || room.status === "playing") return sendError(conn, "WRONG_STATE", "Không thể nộp bot khi trận đã bắt đầu.");

            const verdict = await validateBot(message.content);
            if (!verdict.ok) return sendError(conn, "INVALID_BOT", verdict.message);
            // Trong lúc kiểm tra, phòng có thể đã đổi trạng thái hoặc người chơi đã rời.
            if (slot.conn !== conn || room.status === "countdown" || room.status === "playing") {
                return sendError(conn, "WRONG_STATE", "Không thể nộp bot lúc này.");
            }
            resetFinished(room);
            slot.source = message.content;
            slot.filename = filename;
            slot.hasBot = true;
            slot.version++;
            slot.ready = false;
            send(conn, {
                type: "bot_accepted",
                version: slot.version,
                bytes,
                sha256: createHash("sha256").update(message.content).digest("hex"),
            });
            broadcastRoom(room);
        },

        ready(conn, message) {
            if (typeof message.ready !== "boolean") return sendError(conn, "INVALID_MESSAGE", "ready phải là true hoặc false.");
            const room = conn.room;
            if (!room) return sendError(conn, "NOT_IN_ROOM", "Bạn không ở trong phòng nào.");
            const slot = slotOf(room, conn.user.id);
            if (!slot) return sendError(conn, "WRONG_STATE", "Khán giả không thể sẵn sàng.");
            if (message.ready && !slot.hasBot) return sendError(conn, "NO_BOT", "Hãy nộp bot trước khi sẵn sàng.");
            if (room.status === "playing") return sendError(conn, "WRONG_STATE", "Trận đấu đang diễn ra.");
            resetFinished(room);
            if (room.status === "countdown" && !message.ready) cancelCountdown(room);
            slot.ready = message.ready;
            broadcastRoom(room);
            beginCountdown(room);
        },
    };

    // ------------------------------------------------------------------- kết nối
    const CLIENT_TYPES = new Set(Object.keys(handlers));
    const BEFORE_AUTH = new Set(["auth", "ping"]);

    wss.on("connection", (socket) => {
        const conn = { socket, user: null, room: null, dropped: false, recent: [] };
        conn.authTimer = setTimeout(() => {
            sendError(conn, "AUTH_TIMEOUT", "Hãy gửi tin auth trong 10 giây đầu.");
            socket.close(1008, "auth timeout");
        }, authTimeoutMs);

        socket.on("message", (raw) => {
            let message;
            try {
                message = JSON.parse(raw.toString());
            } catch {
                return sendError(conn, "INVALID_MESSAGE", "Thông điệp phải là JSON hợp lệ.");
            }
            if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
                return sendError(conn, "INVALID_MESSAGE", "Thông điệp phải là object có trường type.");
            }
            if (message.v !== undefined && message.v !== PROTOCOL_VERSION) {
                return sendError(conn, "UNSUPPORTED_PROTOCOL", `Máy chủ hỗ trợ giao thức phiên bản ${PROTOCOL_VERSION}.`);
            }
            if (!CLIENT_TYPES.has(message.type)) return sendError(conn, "UNKNOWN_TYPE", `Không nhận loại tin: ${message.type}`);

            if (message.type !== "ping") {
                const nowMs = Date.now();
                conn.recent = conn.recent.filter((time) => nowMs - time < 1000);
                if (conn.recent.length >= maxMessagesPerSecond) return sendError(conn, "RATE_LIMITED", "Bạn gửi quá nhiều tin.");
                conn.recent.push(nowMs);
            }
            if (!conn.user && !BEFORE_AUTH.has(message.type)) return sendError(conn, "NOT_AUTHENTICATED", "Hãy gửi tin auth trước.");

            (async () => handlers[message.type](conn, message))().catch((error) => {
                console.error(`Lỗi khi xử lý ${message.type}:`, error);
                sendError(conn, "INTERNAL_ERROR", "Lỗi máy chủ.");
            });
        });

        socket.on("close", () => dropConnection(conn));
        socket.on("error", (error) => console.error("WebSocket error:", error.message));
    });

    function handleUpgrade(request, socket, head) {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname !== "/ws") return false;
        wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
        return true;
    }

    function close() {
        clearInterval(sweepTimer);
        sweepTimer = null;
        for (const room of rooms.values()) {
            clearTimeout(room.countdownTimer);
            room.players.forEach((slot) => clearTimeout(slot.graceTimer));
        }
        for (const client of wss.clients) client.terminate();
    }

    return { wss, handleUpgrade, rooms, queue, ratings, close };
}
