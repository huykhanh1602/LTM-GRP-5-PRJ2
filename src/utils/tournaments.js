// ============================================================
// QUẢN LÝ DỮ LIỆU GIẢI ĐẤU (TOURNAMENT STORAGE & HELPERS)
// ============================================================

const STORAGE_KEY = "daubot_tournaments_v1";

// Danh sách các giải đấu mẫu ban đầu
export const INITIAL_TOURNAMENTS = [
  {
    id: "TOUR-KBB-2026",
    name: "Đại Chiến Kéo Búa Bao Mùa Xuân 2026",
    game_id: "rps_chess",
    game_name: "Kéo · Búa · Bao Cờ",
    organizer: "Ban Tổ Chức BotVui",
    participants: 64,
    registered_teams: 42,
    status: "ongoing", // "upcoming" | "ongoing" | "completed"
    start_time: "2026-10-25 19:30",
    prize: "5.000.000 VNĐ + Cúp Vô Địch",
    description: "Giải đấu bot chiến thuật KBB quy tụ các lập trình viên hàng đầu trường và cộng đồng open-source.",
    created_at: "2026-10-15T08:00:00.000Z",
  },
  {
    id: "TOUR-AI-ARENA",
    name: "AI Arena Cup: Chiến Thuật Đỉnh Cao",
    game_id: "rps_chess",
    game_name: "Kéo · Búa · Bao Cờ",
    organizer: "CLB Lập Trình AI",
    participants: 128,
    registered_teams: 85,
    status: "upcoming",
    start_time: "2026-11-01 20:00",
    prize: "Bàn phím cơ & Vinh danh BXH",
    description: "Sân chơi cho các thuật toán tìm đường A* và đối kháng Minimax mở rộng.",
    created_at: "2026-10-18T10:00:00.000Z",
  },
  {
    id: "TOUR-ROOKIE-KBB",
    name: "Giải Tân Binh KBB - Vòng Khởi Động",
    game_id: "rps_chess",
    game_name: "Kéo · Búa · Bao Cờ",
    organizer: "Admin Thân Thiện",
    participants: 32,
    registered_teams: 32,
    status: "completed",
    start_time: "2026-10-12 18:00",
    prize: "Huy hiệu Chiến Binh & Quà lưu niệm",
    description: "Giải đấu giao lưu làm quen với nền tảng thi đấu bot thời gian thực.",
    created_at: "2026-10-10T12:00:00.000Z",
  },
  {
    id: "TOUR-CARO-PRO",
    name: "Siêu Cúp Caro AI Mở Rộng",
    game_id: "caro_bot",
    game_name: "Cờ Caro AI Đại Chiến",
    organizer: "Hội Cờ Caro AI",
    participants: 16,
    registered_teams: 12,
    status: "upcoming",
    start_time: "2026-11-15 14:00",
    prize: "Cúp danh dự & Áo đấu BotVui",
    description: "Đối đầu giữa các engine cờ caro thông minh trên bàn cờ 15x15.",
    created_at: "2026-10-19T09:00:00.000Z",
  },
];

// Lấy danh sách giải đấu từ localStorage (kèm dữ liệu mặc định)
export function getStoredTournaments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TOURNAMENTS));
      return INITIAL_TOURNAMENTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_TOURNAMENTS;
  } catch {
    return INITIAL_TOURNAMENTS;
  }
}

// Lưu giải đấu mới vào hệ thống (không cần duyệt, có hiệu lực ngay)
export function saveNewTournament(tourData, user) {
  const current = getStoredTournaments();
  const codeSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const newTour = {
    id: tourData.id || `TOUR-${codeSuffix}`,
    name: tourData.name,
    game_id: tourData.game_id || "rps_chess",
    game_name: tourData.game_name || "Kéo · Búa · Bao Cờ",
    organizer: user?.display_name || tourData.organizer || "Người chơi tự do",
    organizer_id: user?.id || null,
    participants: Number(tourData.participants) || 16,
    registered_teams: 1, // Người tạo tự động tính 1 slot
    status: tourData.status || "upcoming", // Giải mới tạo mặc định "Sắp diễn ra" (hoặc đang diễn ra), không cần duyệt
    start_time: tourData.start_time || "Cuối tuần này",
    prize: tourData.prize || "Cúp lưu niệm & Điểm ELO",
    description: tourData.description || "",
    created_at: new Date().toISOString(),
  };

  const updated = [newTour, ...current];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newTour;
}
