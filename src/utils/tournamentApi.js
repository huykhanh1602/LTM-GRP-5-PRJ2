// ============================================================
// Adapter: dữ liệu giải đấu từ API thật -> mô hình UI (tournamentView).
// Không còn dữ liệu giả: mọi trường đều lấy từ backend.
// ============================================================
import { normalizeTournament } from "./tournamentView.js";
import { CONTROLS_BY_MODE } from "../../shared/domain/tournament.js";

export const BYE_ID = "__BYE__";

// Danh sách kiểu điều khiển giải cho phép, mặc định chỉ bot.
export const controlsListOf = (config) => CONTROLS_BY_MODE[config?.allowedControls ?? "BOT"] ?? ["bot"];

// Nhãn ngắn cho giao diện biết giải cho đấu kiểu gì.
export function controlsLabel(allowedControls) {
  const set = [...(allowedControls ?? ["bot"])].sort().join("+");
  if (set === "human") return "🖱️ Chỉ đấu bằng chuột";
  if (set === "bot+human") return "🤖/🖱️ Bot hoặc chuột, tự chọn";
  return "🤖 Chỉ đấu bot";
}

const BYE_ENTRY = {
  user_id: BYE_ID,
  display_name: "Bye (đi thẳng)",
  avatar_url: "/icons.png",
  seed: 0,
};

const STATUS_HINTS = {
  draft: "Giải chưa mở đăng ký — chủ giải vẫn đang hoàn thiện thể lệ.",
  open: "Đang mở đăng ký — vào xem luật, đếm ngược và bấm đăng ký để giành suất.",
  in_progress: "Giải đang diễn ra — đã khóa đăng ký, chỉ có thể theo dõi nhánh đấu.",
  completed: "Giải đã kết thúc — xem lại sơ đồ nhánh và replay từng trận.",
  cancelled: "Giải đã bị hủy bởi chủ giải.",
};

const ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: "Bạn cần đăng nhập để thực hiện thao tác này.",
  USER_BANNED: "Tài khoản của bạn đã bị khóa.",
  ORGANIZER_REQUIRED: "Chỉ người tổ chức giải mới được thao tác.",
  ENTRY_EXISTS: "Bạn đã đăng ký tham gia giải đấu này rồi.",
  TOURNAMENT_NOT_OPEN: "Giải đã khóa đăng ký nên không thể tham gia nữa.",
  REGISTRATION_NOT_OPEN: "Chưa tới ngày mở đơn, giải chưa cho đăng ký.",
  REGISTRATION_CLOSED: "Giải đã đóng đơn, không thể đăng ký thêm.",
  REGISTRATION_STILL_OPEN: "Chưa tới thời gian đóng đơn nên chưa thể khởi tranh.",
  TOURNAMENT_STARTED: "Giải đã khởi tranh nên không sửa được khung mở/đóng đơn nữa.",
  KICKOFF_BEFORE_CLOSE: "Ngày khởi tranh phải sau thời gian đóng đơn.",
  TOURNAMENT_FULL: "Giải đấu đã đủ số lượng người tham gia.",
  NOT_ENOUGH_PARTICIPANTS: "Cần ít nhất 2 suất tham gia mới có thể khởi tranh.",
  BRACKET_EXISTS: "Sơ đồ nhánh của giải đã được tạo rồi.",
  FORMAT_NOT_SUPPORTED: "Thể thức này chưa hỗ trợ xếp nhánh đấu.",
  MATCH_NOT_FINISHED: "Trận đấu phải ở trạng thái đã kết thúc.",
  MATCH_MISMATCH: "Trận đấu không thuộc về hai đấu thủ của nhánh này.",
  SLOT_NOT_FOUND: "Không tìm thấy nhánh đấu này.",
  SLOT_IS_BYE: "Nhánh này là suất đi thẳng, không cần kết quả.",
  SLOT_NOT_READY: "Nhánh đấu chưa xác định đủ hai đấu thủ.",
  TOURNAMENT_NOT_RUNNING: "Giải đấu phải đang diễn ra mới gắn được kết quả.",
  INVALID_WINNER: "Người thắng phải là một trong hai đấu thủ của nhánh.",
  TOURNAMENT_NOT_FOUND: "Không tìm thấy giải đấu.",
  USER_NOT_FOUND: "Không tìm thấy người chơi này.",
  NO_ACTIVE_MATCH: "Bạn chưa có trận đấu nào chờ sẵn sàng trong vòng hiện tại.",
  SUBMISSION_REQUIRED: "Hãy nộp code trước khi bấm Sẵn sàng.",
  INVALID_MODE: "Giải không ở chế độ nộp bot theo vòng.",
  ROUND_NOT_FOUND: "Không tìm thấy vòng đấu này.",
};

export function apiErrorText(error) {
  return ERROR_MESSAGES[error?.code] ?? error?.message ?? "Có lỗi xảy ra, hãy thử lại.";
}

// Slot từ API -> slot UI: lấy matchId làm replayId để mở được replay thật.
function decorateSlots(bracket) {
  if (!bracket?.rounds) return bracket;
  return {
    ...bracket,
    rounds: bracket.rounds.map((slots) =>
      slots.map((slot) => ({
        ...slot,
        replayId: slot.matchId ?? slot.result?.source_match_id ?? null,
        startedAt: slot.playedAt ?? null,
      })),
    ),
  };
}

function formatLabelOf(config, status, format) {
  const capacity = Number(config?.maxParticipants) || 0;
  const base = format === "round_robin" ? "Vòng tròn" : "Loại trực tiếp";
  if (!capacity) return base;
  return status === "completed" ? base : `${base} · tối đa ${capacity} đội`;
}

// API tournament -> input của normalizeTournament.
export function toTournamentInput(api, currentUserId) {
  const config = api.config ?? {};
  const entries = Array.isArray(api.entries) ? api.entries : [];
  const bracket = decorateSlots(api.bracket ?? null);
  const needsBye =
    bracket?.rounds?.some(
      (slots) =>
        slots.some((slot) => slot.participantAId === BYE_ID || slot.participantBId === BYE_ID),
    ) ?? false;

  return {
    id: api.id,
    code: api.code,
    name: api.name,
    gameId: api.game_id,
    gameName: api.game_name,
    format: api.format,
    status: api.status,
    startAt: api.starts_at,
    endedAt: ["completed", "cancelled"].includes(api.status) ? api.ended_at ?? null : null,
    // Chỉ dùng cho timeline: giải cũ suy ra mở đơn từ lúc tạo, đóng đơn khi khai mạc.
    registrationOpensAt: config.registrationOpensAt ?? api.created_at ?? null,
    registrationClosesAt: config.registrationClosesAt ?? api.starts_at ?? null,
    championId: api.champion_id,
    prize: config.prize ?? "Cúp vinh danh",
    description: config.description ?? "",
    rules: Array.isArray(config.rules) ? config.rules : [],
    organizer: { name: config.organizerName ?? "Ban Tổ Chức" },
    capacity: config.maxParticipants ?? entries.length,
    registered: api.participant_count ?? entries.length,
    entries: needsBye ? [...entries, BYE_ENTRY] : entries,
    bracket,
    rounds: api.rounds ?? [],
    formatLabel: formatLabelOf(config, api.status, api.format),
    statusHint: STATUS_HINTS[api.status] ?? "",
    languages: Array.isArray(config.languages) ? config.languages : [],
    organizerId: config.organizerId ?? null,
    participantMode: config.participantMode ?? "INDIVIDUAL",
    minTeamSize: config.minTeamSize ?? 1,
    maxTeamSize: config.maxTeamSize ?? 5,
    roundSubmissionMode: config.roundSubmissionMode ?? "SINGLE",
    submissionWindowMinutes: config.submissionWindowMinutes ?? 10,
    myEntryId:
      currentUserId && entries.some((entry) => String(entry.user_id) === String(currentUserId))
        ? String(currentUserId)
        : null,
  };
}

export function toTournamentView(api, currentUserId) {
  const view = normalizeTournament(toTournamentInput(api, currentUserId), {}, { currentUserId });
  return {
    ...view,
    languages: Array.isArray(api.config?.languages) ? api.config.languages : [],
    organizerId: api.config?.organizerId ?? null,
    registrationOpensAt: api.config?.registrationOpensAt ?? null,
    registrationClosesAt: api.config?.registrationClosesAt ?? null,
    allowedControls: controlsListOf(api.config),
    isOrganizer: Boolean(currentUserId) && api.config?.organizerId === currentUserId,
    isRegistered: Boolean(view.myEntryId),
    raw: api,
  };
}

// Danh sách giải (GameLobby) -> dữ liệu card.
export function toTournamentCard(api) {
  const config = api.config ?? {};
  return {
    id: api.id,
    code: api.code,
    name: api.name,
    gameId: api.game_id,
    gameName: api.game_name,
    status: api.status,
    startsAt: api.starts_at,
    endedAt: ["completed", "cancelled"].includes(api.status) ? api.ended_at ?? null : null,
    createdAt: api.created_at ?? null,
    registrationOpensAt: config.registrationOpensAt ?? null,
    registrationClosesAt: config.registrationClosesAt ?? null,
    hasRegistrationWindow: Boolean(config.registrationOpensAt && config.registrationClosesAt),
    participantMode: config.participantMode ?? "INDIVIDUAL",
    organizerId: config.organizerId ?? null,
    organizerName: config.organizerName ?? "Ban Tổ Chức",
    registered: api.participant_count ?? 0,
    capacity: Number(config.maxParticipants) || 0,
    prize: config.prize ?? "",
    description: config.description ?? "",
    languages: Array.isArray(config.languages) ? config.languages : [],
    allowedControls: controlsListOf(config),
    controlsMode: config.allowedControls ?? "BOT",
  };
}

// Đơn vị đếm số suất tham gia: Đội hay Người.
export const participantUnit = (mode) => (mode === "TEAM" ? "đội" : "người");

// Trạng thái khung đăng ký của giải đang mở đơn.
export function registrationWindowState(card, now = Date.now()) {
  if (card.status !== "open") return null;
  if (!card.hasRegistrationWindow) return { cls: "live", text: "🟢 Đang mở đơn" };
  const opensAt = card.registrationOpensAt ? Date.parse(card.registrationOpensAt) : null;
  const closesAt = card.registrationClosesAt ? Date.parse(card.registrationClosesAt) : null;
  if (opensAt !== null && now < opensAt) return { cls: "locked", text: "⛔ Chưa mở đơn" };
  if (closesAt !== null && now > closesAt) return { cls: "locked", text: "🔒 Đã đóng đơn" };
  return { cls: "live", text: "🟢 Đang mở đơn" };
}

// Các dòng lịch trên card: giải đã đấu chỉ có khai mạc/kết thúc,
// giải chưa đấu có khai mạc (nếu ấn định) kèm mở đơn - đóng đơn.
export function tournamentScheduleLines(card) {
  const kickoff = card.startsAt ? formatStartsAt(card.startsAt) : null;
  const end = card.endedAt ? formatStartsAt(card.endedAt) : null;

  if (card.status === "in_progress") {
    return [
      { icon: "🚀", label: "Khai mạc", value: kickoff ?? "đã diễn ra" },
      { icon: "🏁", label: "Kết thúc", value: end ?? "đang thi đấu" },
    ];
  }
  if (card.status !== "open") {
    return [
      { icon: "🚀", label: "Khai mạc", value: kickoff ?? "Chưa ấn định" },
      { icon: "🏁", label: "Kết thúc", value: end ?? kickoff ?? "Chưa ghi nhận" },
    ];
  }

  // Giải cũ chưa lưu khung đăng ký: mở đơn tính từ lúc tạo, đóng đơn khi khai mạc.
  const opensAt = card.registrationOpensAt ?? card.createdAt ?? null;
  const closesAt = card.registrationClosesAt ?? card.startsAt ?? null;
  const lines = [];
  lines.push({ icon: "📝", label: "Mở đơn", value: opensAt ? formatStartsAt(opensAt) : "Đang mở" });
  lines.push({
    icon: "🔒",
    label: "Đóng đơn",
    value: closesAt ? formatStartsAt(closesAt) : "khi chủ giải khởi tranh",
  });
  if (kickoff) lines.push({ icon: "🚀", label: "Khai mạc", value: kickoff });
  return lines;
}

export function formatStartsAt(value) {
  if (!value) return "Chưa ấn định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa ấn định";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
