// Kênh thật nói chuyện với server bằng GIAO THỨC WEBSOCKET v2 (docs/WS_PROTOCOL_V2.md).
//
// Giao diện (useRoom, Room, Match...) vẫn dùng mô hình phòng quen thuộc, nên file này làm hai việc:
//   1. Đăng nhập: POST /api/auth/guest lấy token phiên, mở /ws rồi gửi tin `auth`.
//   2. Chuyển tin v2 -> mô hình giao diện (toUiMessage) và ngược lại (ready, submit_bot).
//
// Kênh trả về: on(fn), send(msg), submitCode(file), close() — giống hệt mockServer.js.

const TEAM_IDS = ["team_a", "team_b"];

// Chuyển room_state v2 thành mô hình phòng của giao diện (luôn đủ 2 ô đội).
export function toUiRoom(m, myUserId) {
    const players = Array.isArray(m.players) ? m.players : [];
    return {
        code: m.room_id,
        status: m.status,
        mode: m.mode,
        game_id: m.game_id,
        spectators: m.spectators ?? 0,
        tournament: m.tournament ?? null,
        allowedControls: Array.isArray(m.allowed_controls) ? m.allowed_controls : ["bot"],
        teams: TEAM_IDS.map((id) => {
            const p = players.find((player) => player.team_id === id);
            return {
                id,
                name: p?.display_name ?? "",
                isMe: Boolean(p) && p.user_id === myUserId,
                connected: Boolean(p?.connected),
                submitted: Boolean(p?.has_bot),
                ready: Boolean(p?.ready),
                filename: p?.filename ?? null,
                control: p?.control === "human" ? "human" : "bot",
            };
        }),
    };
}

// Chuyển một tin v2 từ server thành tin cho giao diện. Trả về null nếu giao diện không cần tin này.
export function toUiMessage(m, myUserId) {
    switch (m.type) {
        case "room_state":
            return { type: "room_state", room: toUiRoom(m, myUserId) };
        case "game_over":
            return {
                type: "match_end",
                match_id: m.match_id,
                winner: m.winner === "draw" ? null : m.winner,
                reason: m.reason ?? null,
                ...(m.elo_change_a !== undefined ? { elo_change_a: m.elo_change_a } : {}),
                ...(m.elo_change_b !== undefined ? { elo_change_b: m.elo_change_b } : {}),
                ...(typeof m.history_saved === "boolean" ? { history_saved: m.history_saved } : {}),
                ...(typeof m.rating_saved === "boolean" ? { rating_saved: m.rating_saved } : {}),
                ...(m.forfeit ? { forfeit: true } : {}),
            };
        case "match_start":
        case "turn":
        case "countdown":
        case "queue_state":
        case "match_found":
            return m;
        case "your_turn":
            return {
                type: "your_turn",
                team_id: m.team_id,
                deadline_ms: m.deadline_ms,
                payload: m.payload,
                expires_at: Date.now() + Math.max(0, Number(m.deadline_ms) || 0),
            };
        case "turn_expired":
            return { type: "turn_expired", team_id: m.team_id };
        case "error":
            return { type: "error", code: m.code, message: m.message || m.code };
        default:
            return null; // auth_ok, bot_accepted, pong, room_left...: kênh tự xử lý
    }
}

const SUBMIT_ERRORS = new Set([
    "INVALID_BOT", "BOT_TOO_LARGE", "UNSUPPORTED_LANGUAGE", "WRONG_STATE", "NOT_IN_ROOM", "INVALID_MESSAGE", "RATE_LIMITED",
]);

export function createSocketChannel({ wsUrl, httpUrl, code, teamName, authToken = null, role, create, find, mode = "casual", gameId = "rps_chess", tournament = null }) {
    const listeners = new Set();
    const emit = (m) => listeners.forEach((l) => l(m));
    let ws = null;
    let myUserId = null;
    let closed = false;
    let pendingSubmit = null;

    const base = typeof window !== "undefined" ? window.location.href : "http://localhost/";
    const apiUrl = (path) => new URL(`${(httpUrl ?? "").replace(/\/+$/, "")}${path}`, base);
    const fail = (message) => emit({ type: "error", message });

    function enterRoom() {
        if (tournament?.tournamentId || tournament?.tournament_id) {
            // Vào phòng đấu của một trận trong giải đấu (lobby → join_tournament_room).
            ws.send(JSON.stringify({
                type: "join_tournament_room",
                game_id: gameId,
                mode: "tournament",
                tournament_id: tournament.tournamentId ?? tournament.tournament_id,
                round_no: tournament.roundNo ?? tournament.round_no,
                slot_index: tournament.slotIndex ?? tournament.slot_index,
            }));
        } else if (role === "spectator") ws.send(JSON.stringify({ type: "watch_room", code }));
        else if (find) ws.send(JSON.stringify({ type: "find_match", game_id: gameId, mode }));
        else if (create) ws.send(JSON.stringify({ type: "create_room", game_id: gameId, mode: "casual" }));
        // join_room dùng mode được truyền vào (thường là "casual" khi nhập mã phòng tay)
        else ws.send(JSON.stringify({ type: "join_room", game_id: gameId, mode, code }));
    }

    function handle(msg) {
        if (msg.type === "auth_ok") {
            myUserId = msg.user.id;
            enterRoom();
            return;
        }
        if (pendingSubmit) {
            if (msg.type === "bot_accepted") {
                pendingSubmit.resolve({ id: msg.sha256, filename: pendingSubmit.filename, version: msg.version });
                pendingSubmit = null;
                return;
            }
            if (msg.type === "error" && SUBMIT_ERRORS.has(msg.code)) {
                pendingSubmit.reject(new Error(msg.message || msg.code));
                pendingSubmit = null;
                return;
            }
        }
        const ui = toUiMessage(msg, myUserId);
        if (ui) emit(ui);
    }

    async function start() {
        let token = authToken;
        try {
            if (!token) {
                const res = await fetch(apiUrl("/api/auth/guest"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ display_name: teamName }),
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || body.error || `Lỗi ${res.status}`);
                token = body.token;
            }
        } catch (e) {
            if (!closed) fail(`Không đăng nhập được: ${e.message}`);
            return;
        }
        if (closed) return;

        ws = new WebSocket(`${wsUrl.replace(/\/$/, "")}/ws`);
        ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
        ws.onmessage = (e) => {
            let msg;
            try {
                msg = JSON.parse(e.data);
            } catch {
                return; // bỏ qua tin không phải JSON
            }
            handle(msg);
        };
        ws.onerror = () => fail("Không kết nối được tới server.");
        ws.onclose = () => {
            if (pendingSubmit) pendingSubmit.reject(new Error("Mất kết nối với server."));
            pendingSubmit = null;
            if (!closed) fail("Mất kết nối với server.");
        };
    }
    void start();

    return {
        on(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        send(msg) {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        },
        // file: File của trình duyệt. Trả về Promise, lỗi thì throw Error có câu báo lỗi tiếng Việt.
        async submitCode(file) {
            if (!ws || ws.readyState !== WebSocket.OPEN || !myUserId) throw new Error("Chưa kết nối vào phòng.");
            if (pendingSubmit) throw new Error("Đang nộp một file khác, hãy chờ.");
            const content = await file.text();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pendingSubmit = null;
                    reject(new Error("Server không phản hồi khi nộp bot."));
                }, 15000);
                pendingSubmit = {
                    filename: file.name,
                    resolve: (v) => { clearTimeout(timer); resolve(v); },
                    reject: (e) => { clearTimeout(timer); reject(e); },
                };
                ws.send(JSON.stringify({ type: "submit_bot", mode_type: "file", language: "python", filename: file.name, content }));
            });
        },
        close() {
            closed = true;
            listeners.clear();
            if (ws) {
                ws.onclose = null;
                // Báo rời phòng để server nhả chỗ ngay thay vì giữ 30 giây.
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "leave_room" }));
                ws.close();
            }
        },
    };
}
