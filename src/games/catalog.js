// ============================================================
// CATALOG GAME & DANH MỤC PHONG CÁCH GAMEVUI
// ============================================================

export const CATEGORIES_ROW_1 = [
  { id: "all", label: "Danh mục", icon: "▦", iconCell: 0, iconBg: "#e8f0ff", bg: "#4378bf", color: "#fff", solid: true },
  { id: "hot", label: "Game Hot", icon: "🔥", iconCell: 1, iconBg: "#fff0e9", bg: "#d93829", color: "#fff", solid: true },
  { id: "hay", label: "Game Hay", icon: "🌟", iconCell: 2, iconBg: "#fff7d6", bg: "#f5a623", color: "#fff", solid: true },
  { id: "new", label: "Game Mới", icon: "✨", iconCell: 3, iconBg: "#e6f8ed", bg: "#27ae60", color: "#fff", solid: true },
  { id: "giai_tri", label: "Giải trí", icon: "🎯", iconCell: 4, iconBg: "#fff0e8", color: "#334155" },
  { id: "game_vui", label: "Game Vui", icon: "😄", iconCell: 5, iconBg: "#fff1df", color: "#334155" },
  { id: "van_phong", label: "Văn phòng", icon: "🗂️", iconCell: 6, iconBg: "#eaf3ff", color: "#334155" },
  { id: "tri_tue", label: "Trí tuệ", icon: "🧠", iconCell: 7, iconBg: "#f1eaff", color: "#334155" },
  { id: "tre_em", label: "Trẻ em", icon: "🧸", iconCell: 8, iconBg: "#fff0f1", color: "#334155" },
];

export const CATEGORIES_ROW_2 = [
  { id: "y8", label: "Game Y8", icon: "Y8", color: "#e02e24", isTextIcon: true },
  { id: "hanh_dong", label: "Hành động", icon: "⚔️", iconCell: 9, iconBg: "#fff0e7", color: "#ea580c" },
  { id: "2_nguoi", label: "2 người", icon: "🧑‍🤝‍🧑", iconCell: 10, iconBg: "#e7f5ff", color: "#0284c7" },
  { id: "phieu_luu", label: "Phiêu lưu", icon: "🧭", iconCell: 11, iconBg: "#e9f8ed", color: "#16a34a" },
  { id: "kinh_dien", label: "Kinh điển", icon: "🕹️", iconCell: 12, iconBg: "#fff7db", color: "#ca8a04" },
  { id: "giai_do_iq", label: "Giải đố IQ", icon: "🧩", iconCell: 13, iconBg: "#f3eaff", color: "#9333ea" },
  { id: "chien_thuat", label: "Chiến thuật", icon: "♟️", iconCell: 14, iconBg: "#ffe9e9", color: "#dc2626" },
  { id: "con_gai", label: "Con gái", icon: "🌸", iconCell: 15, iconBg: "#ffeaf4", color: "#db2777" },
  { id: "pikachu", label: "Game Pikachu", icon: "⚡", iconImage: "/category-pikachu-3d.png", iconBg: "#fff8d7", color: "#b77900" },
];

export const ALL_CATEGORIES = [...CATEGORIES_ROW_1, ...CATEGORIES_ROW_2];

export const GAME_CATALOG = [
  // ── Game 2: Rắn Săn Mồi (Snake Bot) ─────────────────────
  {
    id: "snake_battle",
    name: "Rắn Săn Mồi",
    shortDesc: "Lập trình bot điều khiển rắn săn mồi và tránh va chạm — người chơi nhiều điểm hơn sẽ thắng cuộc.",
    cover: "/game/rsm_game.png",
    icon: "/logo/rsm_logo.png",
    accentColor: "#22c55e",
    categories: ["all", "hot", "hay", "chien_thuat", "tri_tue", "2_nguoi"],
    tags: ["Snake", "Bot", "2 người", "Điểm số"],
    playerCount: "2 người",
    ageBadge: "6+",
    available: true,
    modes: {
      casual: {
        enabled: true,
        label: "Chơi vui",
        badge: "casual",
        desc: "Ghép ngẫu nhiên hoặc tạo phòng riêng. Không tính Elo. Thử nghiệm bot thoải mái.",
      },
      ranked: {
        enabled: true,
        label: "Đua hạng",
        badge: "ranked",
        desc: "Ghép tự động theo Elo. Kết quả được lưu vào bảng xếp hạng máy chủ.",
      },
      tournament: {
        enabled: true,
        label: "Giải đấu",
        badge: "tournament",
        desc: "Thi đấu loại trực tiếp hoặc tính điểm vòng tròn chọn nhà vô địch.",
      },
    },
  },

  // ── Game 1: Kéo Búa Bao Cờ ──────────────────────────────
  {
    id: "rps_chess",
    name: "Kéo Búa Bao",
    shortDesc: "Lập trình bot chiến đấu trên bàn cờ chiến thuật — ai chiếm căn cứ đối thủ trước thì thắng.",
    cover: "/game/kbb_game.png",
    icon: "/logo/kbb_logo.webp",
    accentColor: "#ff4d6d",
    categories: ["all", "hot", "hay", "chien_thuat", "tri_tue", "2_nguoi", "giai_do_iq"],
    tags: ["Chiến thuật", "Bot", "2 người", "Trí tuệ"],
    playerCount: "2 người",
    ageBadge: "12+",
    available: true,
    modes: {
      casual: {
        enabled: true,
        label: "Chơi vui",
        badge: "casual",
        desc: "Ghép ngẫu nhiên hoặc tạo phòng riêng. Không tính Elo. Thử nghiệm bot thoải mái.",
      },
      ranked: {
        enabled: true,
        label: "Đua hạng",
        badge: "ranked",
        desc: "Ghép tự động theo điểm Elo. Kết quả được lưu và cập nhật bảng xếp hạng toàn máy chủ.",
      },
      tournament: {
        enabled: true,
        label: "Giải đấu",
        badge: "tournament",
        desc: "Tham gia giải đấu do Ban tổ chức hoặc cá nhân mở. Điểm cộng dồn theo sơ đồ giải đấu.",
      },
    },
  },

  // ── Game 2: Cờ Caro Bot ─────────────────────────────────
  {
    id: "caro_bot",
    name: "Cờ Caro AI Đại Chiến",
    shortDesc: "Đấu trí trên bàn cờ Caro 15x15 không giới hạn. Thuật toán Minimax đối đầu Heuristic.",
    cover: "/bg.jpg",
    icon: "/icons.png",
    accentColor: "#38bdf8",
    categories: ["all", "new", "tri_tue", "2_nguoi", "kinh_dien", "giai_do_iq"],
    tags: ["Trí tuệ", "Cờ Caro", "2 người"],
    playerCount: "2 người",
    ageBadge: "All",
    available: false,
    modes: {
      casual: { enabled: true, label: "Chơi vui", badge: "casual", desc: "Đấu cờ giao lưu tự do." },
      ranked: { enabled: true, label: "Đua hạng", badge: "ranked", desc: "Cày Elo cờ Caro." },
      tournament: { enabled: false, label: "Giải đấu", badge: "tournament", desc: "Chưa mở giải." },
    },
  },

  // ── Game 3: Đấu Trường Xe Tăng ─────────────────────────
  {
    id: "tank_war",
    name: "Tank Battle AI Arena",
    shortDesc: "Điều khiển xe tăng bắn phá chướng ngại vật, tính toán góc đạn và hạ gục bot địch.",
    cover: "/bg.jpg",
    icon: "/icons.png",
    accentColor: "#10b981",
    categories: ["all", "hot", "hanh_dong", "chien_thuat", "2_nguoi", "y8"],
    tags: ["Bắn súng", "Hành động", "Bot"],
    playerCount: "2-4 người",
    ageBadge: "12+",
    available: false,
    modes: {
      casual: { enabled: true, label: "Chơi vui", badge: "casual", desc: "Bắn nhau thư giãn." },
      ranked: { enabled: false, label: "Đua hạng", badge: "ranked", desc: "Chưa mở." },
      tournament: { enabled: false, label: "Giải đấu", badge: "tournament", desc: "Chưa mở." },
    },
  },

  // ── Game 4: Cờ Vua Biến Thể ─────────────────────────────
  {
    id: "chess_variant",
    name: "Cờ Vua Bot Biến Thể",
    shortDesc: "Luật cờ vua mới với quân cờ có kỹ năng đặc biệt và nước đi ngẫu nhiên.",
    cover: "/bg.jpg",
    icon: "/icons.png",
    accentColor: "#a855f7",
    categories: ["all", "hay", "tri_tue", "chien_thuat", "giai_tri"],
    tags: ["Chiến thuật", "Cờ vua", "Bot"],
    playerCount: "2 người",
    ageBadge: "16+",
    available: false,
    modes: {
      casual: { enabled: true, label: "Chơi vui", badge: "casual", desc: "Giao hữu bàn cờ." },
      ranked: { enabled: false, label: "Đua hạng", badge: "ranked", desc: "Chưa mở." },
      tournament: { enabled: false, label: "Giải đấu", badge: "tournament", desc: "Chưa mở." },
    },
  },
];
