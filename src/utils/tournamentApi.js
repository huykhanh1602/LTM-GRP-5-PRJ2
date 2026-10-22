// ============================================================
// Adapter: dữ liệu giải đấu từ API thật -> mô hình UI (tournamentView).
// Không còn dữ liệu giả: mọi trường đều lấy từ backend.
// ============================================================
import { normalizeTournament } from "./tournamentView.js";

export const BYE_ID = "__BYE__";

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
  TOURNAMENT_FULL: "Giải đấu đã đủ số lượng người tham gia.",
  NOT_ENOUGH_PARTICIPANTS: "Cần ít nhất 2 người đăng ký mới có thể khởi tranh.",
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
        replayId: slot.matchId ?? null,
        startedAt: slot.playedAt ?? null,
      })),
    ),
  };
}

function formatLabelOf(config, status) {
  const capacity = Number(config?.maxParticipants) || 0;
  const base = "Loại trực tiếp";
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
    formatLabel: formatLabelOf(config, api.status),
    statusHint: STATUS_HINTS[api.status] ?? "",
    languages: Array.isArray(config.languages) ? config.languages : [],
    organizerId: config.organizerId ?? null,
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
    organizerId: config.organizerId ?? null,
    organizerName: config.organizerName ?? "Ban Tổ Chức",
    registered: api.participant_count ?? 0,
    capacity: Number(config.maxParticipants) || 0,
    prize: config.prize ?? "",
    description: config.description ?? "",
    languages: Array.isArray(config.languages) ? config.languages : [],
  };
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
