import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import { WebSocketServer } from "ws";
import { runEngineMatch } from "./engineRunner.js";

const TEAM_IDS = ["team_a", "team_b"];
const MAX_BOT_BYTES = 100 * 1024;

function send(socket, message) {
    if (socket.readyState === 1) {
        socket.send(JSON.stringify(message));
    }
}

function createRoom(code) {
    return {
        code,
        status: "waiting",
        teams: TEAM_IDS.map((id) => ({
            id,
            name: "",
            connected: false,
            submitted: false,
            filename: null,
            ready: false,
            code: null,
            playerToken: null,
            socket: null,
        })),
        clients: new Map(),
        countdownTimer: null,
        countdownToken: 0,
        runToken: 0,
    };
}

export function createRoomGateway({
    runMatch = runEngineMatch,
    countdownMs = 1000,
} = {}) {
    const wss = new WebSocketServer({ noServer: true });
    const rooms = new Map();

    function getRoom(code, create = false) {
        let room = rooms.get(code);
        if (!room && create) {
            room = createRoom(code);
            rooms.set(code, room);
        }
        return room ?? null;
    }

    function roomState(room, viewer) {
        return {
            type: "room_state",
            room: {
                code: room.code,
                status: room.status,
                teams: room.teams.map((team) => ({
                    id: team.id,
                    name: team.name,
                    isMe: viewer.role === "player" && viewer.team === team,
                    connected: team.connected,
                    submitted: team.submitted,
                    ready: team.ready,
                    filename: team.filename,
                })),
            },
        };
    }

    function broadcastRoom(room) {
        for (const [socket, viewer] of room.clients) {
            send(socket, roomState(room, viewer));
        }
    }

    function broadcast(room, message) {
        for (const socket of room.clients.keys()) {
            send(socket, message);
        }
    }

    function cancelCountdown(room) {
        room.countdownToken++;
        if (room.countdownTimer !== null) {
            clearTimeout(room.countdownTimer);
            room.countdownTimer = null;
        }
        if (room.status === "countdown") {
            room.status = "waiting";
            broadcast(room, { type: "countdown", seconds: null });
        }
    }

    async function startMatch(room, token) {
        if (token !== room.countdownToken || room.status !== "countdown") return;

        room.status = "playing";
        room.countdownTimer = null;
        const runToken = ++room.runToken;
        broadcastRoom(room);

        try {
            await runMatch({
                roomCode: room.code,
                teamA: room.teams[0],
                teamB: room.teams[1],
                onEvent(message) {
                    if (runToken !== room.runToken) return;
                    if (message.type === "match_end") {
                        room.status = "finished";
                        room.teams.forEach((team) => { team.ready = false; });
                    }
                    broadcast(room, message);
                    if (message.type === "match_end") broadcastRoom(room);
                },
            });

            if (runToken === room.runToken && room.status === "playing") {
                throw new Error("Engine kết thúc mà không gửi sự kiện match_end.");
            }
        } catch (error) {
            if (runToken !== room.runToken) return;
            room.status = "waiting";
            room.teams.forEach((team) => { team.ready = false; });
            broadcast(room, {
                type: "error",
                message: `Không thể chạy trận đấu: ${error.message}`,
            });
            broadcastRoom(room);
        }
    }

    function beginCountdown(room) {
        if (
            room.status !== "waiting" ||
            !room.teams.every((team) => team.connected && team.submitted && team.ready)
        ) return;

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

    function assignPlayer(room, name) {
        const reconnecting = room.teams.find(
            (team) => !team.connected && team.name === name
        );
        if (reconnecting) return reconnecting;
        return room.teams.find((team) => !team.connected && !team.name) ?? null;
    }

    wss.on("connection", (socket, _request, code) => {
        let viewer = null;
        let joinTimer = setTimeout(() => {
            send(socket, { type: "error", message: "Hãy gửi yêu cầu join_room." });
            socket.close(1008, "join_room required");
        }, 10000);

        socket.on("message", (rawData) => {
            let message;
            try {
                message = JSON.parse(rawData.toString());
            } catch {
                send(socket, { type: "error", message: "Thông điệp phải là JSON hợp lệ." });
                return;
            }
            if (!message || typeof message !== "object" || Array.isArray(message)) {
                send(socket, { type: "error", message: "Thông điệp không hợp lệ." });
                return;
            }

            if (!viewer) {
                if (
                    message.type !== "join_room" ||
                    message.code !== code ||
                    !["player", "spectator"].includes(message.role)
                ) {
                    send(socket, { type: "error", message: "Yêu cầu tham gia phòng không hợp lệ." });
                    return;
                }

                const room = getRoom(code, message.role === "player");
                if (!room) {
                    send(socket, { type: "error", message: "Phòng không tồn tại." });
                    return;
                }
                let team = null;
                if (message.role === "player") {
                    const name = typeof message.team_name === "string" ? message.team_name.trim() : "";
                    if (!name || name.length > 30) {
                        send(socket, { type: "error", message: "Tên đội phải có từ 1 đến 30 ký tự." });
                        return;
                    }
                    if (room.status === "playing" || room.status === "countdown") {
                        send(socket, { type: "error", message: "Trận đấu đã bắt đầu, không thể tham gia với tư cách đội chơi." });
                        return;
                    }
                    if (message.team_id !== undefined) {
                        team = room.teams.find((roomTeam) => roomTeam.id === message.team_id) ?? null;
                        if (!team || team.name !== name) {
                            send(socket, { type: "error", message: "Đội được yêu cầu không khớp với phòng." });
                            return;
                        }
                    } else {
                        if (room.teams.some((roomTeam) => roomTeam.connected && roomTeam.name === name)) {
                            send(socket, { type: "error", message: "Tên đội này đang kết nối trong phòng." });
                            return;
                        }
                        team = assignPlayer(room, name);
                    }
                    if (!team) {
                        send(socket, { type: "error", message: "Phòng đã đủ hai đội." });
                        return;
                    }
                    if (room.status === "finished") {
                        room.status = "waiting";
                        room.teams.forEach((roomTeam) => { roomTeam.ready = false; });
                    }
                    if (team.socket) {
                        room.clients.delete(team.socket);
                        team.socket.close(4001, "Player reconnected");
                    }
                    team.name = name;
                    team.connected = true;
                    team.ready = false;
                    team.playerToken = randomUUID();
                    team.socket = socket;
                }

                clearTimeout(joinTimer);
                joinTimer = null;
                viewer = { role: message.role, team, room };
                room.clients.set(socket, viewer);
                send(socket, {
                    type: "joined",
                    team_id: team?.id ?? null,
                    player_token: team?.playerToken ?? null,
                });
                broadcastRoom(room);
                return;
            }

            if (message.type !== "ready" || viewer.role !== "player" || typeof message.ready !== "boolean") {
                send(socket, { type: "error", message: "Thông điệp không hợp lệ cho kết nối này." });
                return;
            }
            const { room, team } = viewer;
            if (!team.submitted) {
                send(socket, { type: "error", message: "Hãy nộp file bot trước khi sẵn sàng." });
                return;
            }
            if (room.status === "playing") {
                send(socket, { type: "error", message: "Trận đấu đang diễn ra." });
                return;
            }

            if (room.status === "finished") {
                room.status = "waiting";
                room.teams.forEach((roomTeam) => { roomTeam.ready = false; });
            }
            if (room.status === "countdown" && !message.ready) cancelCountdown(room);
            team.ready = message.ready;
            broadcastRoom(room);
            beginCountdown(room);
        });

        socket.on("close", () => {
            if (joinTimer !== null) clearTimeout(joinTimer);
            if (!viewer) return;
            const { room, team } = viewer;
            room.clients.delete(socket);
            if (team && team.socket === socket) {
                team.connected = false;
                team.ready = false;
                team.playerToken = null;
                team.socket = null;
                if (room.status === "countdown") cancelCountdown(room);
            }
            if (room.status !== "playing") broadcastRoom(room);
        });

        socket.on("error", (error) => {
            console.error("Room WebSocket error:", error.message);
        });
    });

    function handleUpgrade(request, socket, head) {
        const pathname = new URL(request.url, "http://localhost").pathname;
        const match = pathname.match(/^\/rooms\/([A-Z0-9]{4})$/);
        if (!match) return false;

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request, match[1]);
        });
        return true;
    }

    async function handleSubmission(request, response, url) {
        const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/submissions$/);
        if (!match) return false;
        const sendJson = (status, body) => {
            response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify(body));
        };

        if (request.method !== "POST") {
            response.setHeader("Allow", "POST");
            sendJson(405, { error: "METHOD_NOT_ALLOWED" });
            return true;
        }
        const room = getRoom(match[1]);
        const team = room?.teams.find(
            (candidate) => candidate.playerToken && candidate.playerToken === request.headers.authorization?.replace(/^Bearer\s+/i, "")
        );
        if (!team) {
            sendJson(401, { error: "PLAYER_NOT_CONNECTED", message: "Hãy kết nối vào phòng trước khi nộp bot." });
            return true;
        }

        const filename = url.searchParams.get("filename") ?? "";
        if (!/^[A-Za-z0-9_-]{1,50}\.py$/i.test(filename)) {
            sendJson(400, { error: "INVALID_FILENAME", message: "Tên file bot phải kết thúc bằng .py." });
            return true;
        }
        if (team.ready || room.status !== "waiting") {
            sendJson(409, { error: "SUBMISSION_LOCKED", message: "Không thể nộp bot khi đội đã sẵn sàng hoặc trận đang chạy." });
            return true;
        }

        try {
            const chunks = [];
            let totalBytes = 0;
            let tooLarge = false;
            for await (const chunk of request) {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BOT_BYTES) {
                    tooLarge = true;
                    continue;
                }
                if (!tooLarge) chunks.push(chunk);
            }
            if (tooLarge) {
                sendJson(413, { error: "FILE_TOO_LARGE", message: "File bot tối đa 100 KB." });
                return true;
            }
            if (totalBytes === 0) {
                sendJson(400, { error: "EMPTY_FILE", message: "File bot không được để trống." });
                return true;
            }

            let codeText;
            try {
                codeText = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
            } catch {
                sendJson(400, { error: "INVALID_ENCODING", message: "File bot phải được mã hóa UTF-8." });
                return true;
            }
            team.code = codeText;
            team.filename = filename;
            team.submitted = true;
            team.ready = false;
            broadcastRoom(room);
            sendJson(200, { id: randomUUID(), filename });
            return true;
        } catch (error) {
            console.error("Bot submission error:", error);
            if (!response.headersSent) {
                sendJson(500, { error: "UPLOAD_FAILED", message: "Không thể lưu file bot." });
            }
            return true;
        }
    }

    return { wss, handleUpgrade, handleSubmission, rooms };
}
