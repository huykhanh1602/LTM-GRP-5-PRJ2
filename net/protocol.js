// =====================================================================
// protocol.js - Hợp đồng giao tiếp giữa máy chủ và bot (WebSocket, JSON)
//
// Quy ước chung:
//   - Mỗi thông điệp là một object JSON: { type, ...dữ liệu }
//   - Bot -> server: "tin của bot" (CLIENT_MESSAGE_TYPES)
//   - Server -> bot: "tin của server" (SERVER_MESSAGE_TYPES)
//   - Server là bên quyết định luật; bot chỉ gửi nước đi.
//
// Một ván điển hình:
//   bot    : JOIN { token }
//   server : JOINED
//   server : RULES_UPDATE (nếu luật đổi)      bot : RULES_ACK
//   server : MATCH_START
//   server : YOUR_TURN { state, valid_moves }  bot : MOVE { match_id, turn, move }
//   server : MOVE_RESULT   (xác nhận nước của chính mình)
//   server : GAME_STATE    (trạng thái mới + nước vừa đi, gửi cho CẢ HAI bên)
//   ...lặp lại...
//   server : GAME_OVER
// =====================================================================

// Phiên bản giao thức. Tăng số này khi thay đổi không tương thích ngược.
export const PROTOCOL_VERSION = 1;

// Các loại thông điệp được sử dụng trong giao thức
export const MESSAGE_TYPES = {
    // --- Kết nối ---
    JOIN: "join",                     // bot -> server: xin vào, kèm token
    JOINED: "joined",                 // server -> bot: được nhận

    // --- Đồng bộ luật (đổi luật sát giờ) ---
    RULES_UPDATE: "rules_update",     // server -> bot: luật mới + danh sách thay đổi
    RULES_ACK: "rules_ack",           // bot -> server: đã nhận luật có mã băm này
    RULES_LOCKED: "rules_locked",     // server -> bot: luật đã khóa, không đổi nữa

    // --- Luyện tập ---
    PRACTICE_REQUEST: "practice_request", // bot -> server: xin đánh với bot dựng sẵn
    PRACTICE_CANCEL: "practice_cancel",   // bot -> server: hủy xin luyện tập

    // --- Trong trận ---
    MATCH_START: "match_start",       // server -> bot: vào trận
    YOUR_TURN: "your_turn",           // server -> bot: đến lượt bạn
    MOVE: "move",                     // bot -> server: nước đi
    MOVE_RESULT: "move_result",       // server -> bot: nước đi của bạn có được nhận không
    GAME_STATE: "game_state",         // server -> bot: trạng thái bàn cờ sau mỗi nước
    GAME_OVER: "game_over",           // server -> bot: ván kết thúc

    // --- Duy trì kết nối ---
    PING: "ping",
    PONG: "pong",

    // --- Lỗi ---
    ERROR: "error",
};

// Tin mà BOT được phép gửi lên server
export const CLIENT_MESSAGE_TYPES = new Set([
    MESSAGE_TYPES.JOIN,
    MESSAGE_TYPES.RULES_ACK,
    MESSAGE_TYPES.PRACTICE_REQUEST,
    MESSAGE_TYPES.PRACTICE_CANCEL,
    MESSAGE_TYPES.MOVE,
    MESSAGE_TYPES.PING,
]);

// Tin mà SERVER gửi xuống bot
export const SERVER_MESSAGE_TYPES = new Set([
    MESSAGE_TYPES.JOINED,
    MESSAGE_TYPES.RULES_UPDATE,
    MESSAGE_TYPES.RULES_LOCKED,
    MESSAGE_TYPES.MATCH_START,
    MESSAGE_TYPES.YOUR_TURN,
    MESSAGE_TYPES.MOVE_RESULT,
    MESSAGE_TYPES.GAME_STATE,
    MESSAGE_TYPES.GAME_OVER,
    MESSAGE_TYPES.PONG,
    MESSAGE_TYPES.ERROR,
]);

// Các mã lỗi mà server có thể trả về
export const ERROR_CODES = {
    // Thông điệp
    INVALID_MESSAGE: "INVALID_MESSAGE",         // không phải JSON / thiếu trường / sai kiểu
    UNKNOWN_TYPE: "UNKNOWN_TYPE",               // loại tin không tồn tại hoặc bot không được gửi
    UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL", // sai protocol_version
    RATE_LIMITED: "RATE_LIMITED",               // gửi quá nhiều tin

    // Nước đi
    INVALID_MOVE: "INVALID_MOVE",               // nước đi sai luật (bị xử thua)
    NOT_YOUR_TURN: "NOT_YOUR_TURN",             // chưa đến lượt
    STALE_TURN: "STALE_TURN",                   // số lượt không khớp (tin cũ, không bị xử thua)
    WRONG_MATCH: "WRONG_MATCH",                 // match_id không khớp trận đang chơi
    BOT_TIMEOUT: "BOT_TIMEOUT",                 // quá giờ suy nghĩ (bị xử thua)

    // Đăng ký và xác thực
    INVALID_TOKEN: "INVALID_TOKEN",
    NOT_REGISTERED: "NOT_REGISTERED",           // chưa JOIN mà đã gửi tin khác
    JOIN_TIMEOUT: "JOIN_TIMEOUT",               // kết nối rồi mà không gửi JOIN
    REGISTRATION_FAILED: "REGISTRATION_FAILED",
    ROOM_FULL: "ROOM_FULL",
    TEAM_ALREADY_REGISTERED: "TEAM_ALREADY_REGISTERED",
    REPLACED: "REPLACED",                       // đội mở kết nối mới nên kết nối cũ bị thay

    // Luật
    RULES_NOT_ACKED: "RULES_NOT_ACKED",         // chưa xác nhận luật hiện hành mà đòi vào trận
    STALE_RULES: "STALE_RULES",                 // RULES_ACK với mã băm không phải luật hiện hành
};

// Đối thủ được phép chọn khi luyện tập
export const PRACTICE_OPPONENTS = ["random", "greedy", "hunter", "any"];

// ---------------------------------------------------------------------
// Hàm kiểm tra cơ bản
// ---------------------------------------------------------------------

// Kiểm tra dữ liệu có phải object thông điệp hợp lệ
export function isValidMessage(message) {
    return (
        message !== null &&
        typeof message === "object" &&
        !Array.isArray(message) &&
        typeof message.type === "string"
    );
}

// Kiểm tra loại thông điệp có được giao thức hỗ trợ không
export function isKnownMessageType(type) {
    return Object.values(MESSAGE_TYPES).includes(type);
}

// Chuỗi không rỗng
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}

// Số nguyên không âm
function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

// Ô cờ dạng [hàng, cột]
function isCell(value) {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        isNonNegativeInteger(value[0]) &&
        isNonNegativeInteger(value[1])
    );
}

// Nước đi dạng { from: [r, c], to: [r, c] }
export function isValidMovePayload(move) {
    return (
        move !== null &&
        typeof move === "object" &&
        isCell(move.from) &&
        isCell(move.to)
    );
}

// ---------------------------------------------------------------------
// Đọc và ghi thông điệp
// ---------------------------------------------------------------------

// Chuyển chuỗi JSON nhận được thành thông điệp
export function parseMessage(rawData) {
    try {
        const message = JSON.parse(rawData.toString());

        if (!isValidMessage(message)) {
            return {
                ok: false,
                error: ERROR_CODES.INVALID_MESSAGE,
            };
        }

        return {
            ok: true,
            message,
        };
    } catch {
        return {
            ok: false,
            error: ERROR_CODES.INVALID_MESSAGE,
        };
    }
}

// Tạo chuỗi JSON để gửi qua WebSocket
export function serializeMessage(message) {
    if (!isValidMessage(message)) {
        throw new TypeError("Invalid message");
    }

    return JSON.stringify(message);
}

// Tạo thông điệp có sẵn trường type và phiên bản giao thức
export function createMessage(type, payload = {}) {
    if (!isKnownMessageType(type)) {
        throw new TypeError("Unknown message type: " + type);
    }

    return {
        type,
        v: PROTOCOL_VERSION,
        ...payload,
    };
}

// Tạo thông điệp lỗi gửi cho bot
export function createError(code, message = "") {
    return createMessage(MESSAGE_TYPES.ERROR, { code, message });
}

// ---------------------------------------------------------------------
// Kiểm tra nội dung từng loại tin của bot
// Mỗi hàm trả về null nếu hợp lệ, hoặc chuỗi mô tả lỗi.
// ---------------------------------------------------------------------
const CLIENT_PAYLOAD_VALIDATORS = {
    // Bot phải gửi token khi đăng ký.
    // rules_hash là mã băm luật bot đang giữ (có thể null nếu chưa có).
    [MESSAGE_TYPES.JOIN]: (m) => {
        if (!isNonEmptyString(m.token)) {
            return "JOIN thiếu token";
        }
        if (m.rules_hash != null && !isNonEmptyString(m.rules_hash)) {
            return "rules_hash phải là chuỗi hoặc bỏ trống";
        }
        return null;
    },

    [MESSAGE_TYPES.RULES_ACK]: (m) =>
        isNonEmptyString(m.rules_hash) ? null : "RULES_ACK thiếu rules_hash",

    [MESSAGE_TYPES.PRACTICE_REQUEST]: (m) =>
        PRACTICE_OPPONENTS.includes(m.opponent)
            ? null
            : "opponent phải là một trong: " + PRACTICE_OPPONENTS.join(", "),

    [MESSAGE_TYPES.PRACTICE_CANCEL]: () => null,

    // MOVE phải có match_id, số lượt và nước đi đúng dạng
    [MESSAGE_TYPES.MOVE]: (m) => {
        if (!isNonEmptyString(m.match_id)) {
            return "MOVE thiếu match_id";
        }
        if (!isNonNegativeInteger(m.turn)) {
            return "MOVE thiếu turn (số nguyên không âm)";
        }
        if (!isValidMovePayload(m.move)) {
            return "move phải có dạng { from: [hàng, cột], to: [hàng, cột] }";
        }
        return null;
    },

    [MESSAGE_TYPES.PING]: () => null,
};

// Kiểm tra các trường bắt buộc của thông điệp bot gửi lên.
// Trả về { ok: true, message } hoặc { ok: false, error, detail }.
export function validateClientMessage(message) {
    if (!isValidMessage(message)) {
        return {
            ok: false,
            error: ERROR_CODES.INVALID_MESSAGE,
            detail: "Thông điệp phải là object có trường type",
        };
    }

    // Loại tin lạ hoặc tin chỉ server mới được gửi
    if (!CLIENT_MESSAGE_TYPES.has(message.type)) {
        return {
            ok: false,
            error: ERROR_CODES.UNKNOWN_TYPE,
            detail: "Bot không được gửi loại tin: " + message.type,
        };
    }

    // Nếu bot có khai báo phiên bản thì phải khớp
    if (message.v != null && message.v !== PROTOCOL_VERSION) {
        return {
            ok: false,
            error: ERROR_CODES.UNSUPPORTED_PROTOCOL,
            detail: "Máy chủ hỗ trợ giao thức phiên bản " + PROTOCOL_VERSION,
        };
    }

    const problem = CLIENT_PAYLOAD_VALIDATORS[message.type](message);
    if (problem) {
        return {
            ok: false,
            error: ERROR_CODES.INVALID_MESSAGE,
            detail: problem,
        };
    }

    return {
        ok: true,
        message,
    };
}

// Gộp đọc + kiểm tra: dùng ngay trong botGateway cho tiện
export function parseClientMessage(rawData) {
    const parsed = parseMessage(rawData);
    if (!parsed.ok) {
        return { ok: false, error: parsed.error, detail: "JSON không hợp lệ" };
    }
    return validateClientMessage(parsed.message);
}