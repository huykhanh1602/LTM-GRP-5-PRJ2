// ============================================================
// MOCK DATA — Phòng chờ Giải đấu (Tournament Lobby)
// Dữ liệu mô phỏng đủ 4 trạng thái theo shared/domain/tournament.js:
//   DRAFT · OPEN · IN_PROGRESS · COMPLETED
// Bracket tuân theo shape của net/domain/tournament/Bracket.js
// ============================================================

export const BRACKET_ROUND_LABELS = ["Tứ kết", "Bán kết", "Chung kết"];

export const TOURNAMENT_PHASES = [
  { key: "draft", label: "DRAFT", viLabel: "Bản nháp", icon: "📝", hint: "BTC đang soạn thể lệ" },
  { key: "open", label: "OPEN", viLabel: "Mở đăng ký", icon: "📣", hint: "Đang nhận bot dự thi" },
  { key: "in_progress", label: "IN PROGRESS", viLabel: "Đang diễn ra", icon: "⚔️", hint: "Các trận đang nổ ra" },
  { key: "completed", label: "COMPLETED", viLabel: "Đã trao giải", icon: "🏆", hint: "Đã tìm ra quán quân" },
];

// ── Danh sách bot tham dự ───────────────────────────────────
export const TOURNAMENT_ENTRIES = [
  {
    id: "bot-alpha",
    teamName: "Alpha Bot",
    botName: "alphabot_v3.py",
    owner: "Minh Anh",
    rating: 1487,
    seed: 1,
    avatar: "/icons.png",
  },
  {
    id: "bot-rock",
    teamName: "RockSolid",
    botName: "rocksolid.js",
    owner: "Gia Bảo",
    rating: 1442,
    seed: 2,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=RockSolid",
  },
  {
    id: "bot-paper",
    teamName: "PaperCut",
    botName: "papercut.cpp",
    owner: "Khánh Linh",
    rating: 1398,
    seed: 3,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=PaperCut",
  },
  {
    id: "bot-scissor",
    teamName: "ScissorSensei",
    botName: "scissor_sensei.py",
    owner: "Đức Huy",
    rating: 1355,
    seed: 4,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Scissor",
  },
  {
    id: "bot-neural",
    teamName: "NeuralClash",
    botName: "neural_clash.py",
    owner: "Thu Hà",
    rating: 1320,
    seed: 5,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Neural",
  },
  {
    id: "bot-byte",
    teamName: "ByteBrawler",
    botName: "byte_brawler.js",
    owner: "Quang Vinh",
    rating: 1288,
    seed: 6,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Byte",
  },
  {
    id: "bot-minimax",
    teamName: "MinimaxVN",
    botName: "minimax_vn.cpp",
    owner: "Hoàng Long",
    rating: 1245,
    seed: 7,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Minimax",
  },
  {
    id: "bot-gpt",
    teamName: "RPS-GPT",
    botName: "rps_gpt.py",
    owner: "Mai Phương",
    rating: 1201,
    seed: 8,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=GPT",
  },
];

export const ENTRY_MAP = Object.fromEntries(
  TOURNAMENT_ENTRIES.map((entry) => [entry.id, entry]),
);

export function getEntry(id) {
  return id ? ENTRY_MAP[id] ?? null : null;
}

// ── Slot trận đấu trong bracket ─────────────────────────────
function slot(roundIndex, matchIndex, extra = {}) {
  return {
    matchKey: `r${roundIndex}m${matchIndex}`,
    roundIndex,
    matchIndex,
    participantAId: null,
    participantBId: null,
    winnerId: null,
    status: "pending",
    score: null,
    matchId: null,
    replayId: null,
    startedAt: null,
    ...extra,
  };
}

// ── Bracket dùng chung cho các trạng thái ──────────────────
const DONE_QUARTERFINALS = [
  slot(0, 0, {
    participantAId: "bot-alpha",
    participantBId: "bot-gpt",
    winnerId: "bot-alpha",
    status: "done",
    score: { a: 2, b: 1 },
    matchId: "M-KBB-QF-01",
    replayId: "rp-9f21",
    startedAt: "2026-10-25T19:30:00+07:00",
  }),
  slot(0, 1, {
    participantAId: "bot-paper",
    participantBId: "bot-neural",
    winnerId: "bot-neural",
    status: "done",
    score: { a: 0, b: 2 },
    matchId: "M-KBB-QF-02",
    replayId: "rp-9f22",
    startedAt: "2026-10-25T19:45:00+07:00",
  }),
  slot(0, 2, {
    participantAId: "bot-rock",
    participantBId: "bot-minimax",
    winnerId: "bot-rock",
    status: "done",
    score: { a: 2, b: 1 },
    matchId: "M-KBB-QF-03",
    replayId: "rp-9f23",
    startedAt: "2026-10-25T20:00:00+07:00",
  }),
  slot(0, 3, {
    participantAId: "bot-scissor",
    participantBId: "bot-byte",
    winnerId: "bot-scissor",
    status: "done",
    score: { a: 2, b: 0 },
    matchId: "M-KBB-QF-04",
    replayId: "rp-9f24",
    startedAt: "2026-10-25T20:15:00+07:00",
  }),
];

const IN_PROGRESS_BRACKET = {
  rounds: [
    DONE_QUARTERFINALS,
    [
      slot(1, 0, {
        participantAId: "bot-alpha",
        participantBId: "bot-neural",
        status: "running",
        score: { a: 1, b: 1 },
        matchId: "M-KBB-SF-01",
        startedAt: "2026-10-25T21:00:00+07:00",
      }),
      slot(1, 1, {
        participantAId: "bot-rock",
        participantBId: "bot-scissor",
        status: "ready",
        matchId: null,
      }),
    ],
    [slot(2, 0, { status: "pending" })],
  ],
};

const COMPLETED_BRACKET = {
  rounds: [
    DONE_QUARTERFINALS,
    [
      slot(1, 0, {
        participantAId: "bot-alpha",
        participantBId: "bot-neural",
        winnerId: "bot-alpha",
        status: "done",
        score: { a: 2, b: 1 },
        matchId: "M-KBB-SF-01",
        replayId: "rp-9f31",
        startedAt: "2026-10-25T21:00:00+07:00",
      }),
      slot(1, 1, {
        participantAId: "bot-rock",
        participantBId: "bot-scissor",
        winnerId: "bot-rock",
        status: "done",
        score: { a: 2, b: 0 },
        matchId: "M-KBB-SF-02",
        replayId: "rp-9f32",
        startedAt: "2026-10-25T21:20:00+07:00",
      }),
    ],
    [
      slot(2, 0, {
        participantAId: "bot-alpha",
        participantBId: "bot-rock",
        winnerId: "bot-alpha",
        status: "done",
        score: { a: 2, b: 1 },
        matchId: "M-KBB-FINAL",
        replayId: "rp-9f40",
        startedAt: "2026-10-25T22:00:00+07:00",
      }),
    ],
  ],
};

// ── Bảng xếp hạng ──────────────────────────────────────────
const STANDINGS_IN_PROGRESS = [
  { entryId: "bot-alpha", played: 3, wins: 3, losses: 0, points: 9, eloDelta: 38, status: "Bán kết" },
  { entryId: "bot-rock", played: 3, wins: 2, losses: 1, points: 6, eloDelta: 21, status: "Bán kết" },
  { entryId: "bot-neural", played: 3, wins: 2, losses: 1, points: 6, eloDelta: 17, status: "Bán kết" },
  { entryId: "bot-scissor", played: 3, wins: 2, losses: 1, points: 6, eloDelta: 12, status: "Bán kết" },
  { entryId: "bot-paper", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -14, status: "Loại" },
  { entryId: "bot-byte", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -16, status: "Loại" },
  { entryId: "bot-minimax", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -19, status: "Loại" },
  { entryId: "bot-gpt", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -22, status: "Loại" },
];

const STANDINGS_COMPLETED = [
  { entryId: "bot-alpha", played: 3, wins: 3, losses: 0, points: 9, eloDelta: 52, status: "Vô địch" },
  { entryId: "bot-rock", played: 3, wins: 2, losses: 1, points: 6, eloDelta: 30, status: "Á quân" },
  { entryId: "bot-neural", played: 2, wins: 1, losses: 1, points: 3, eloDelta: 8, status: "Bán kết" },
  { entryId: "bot-scissor", played: 2, wins: 1, losses: 1, points: 3, eloDelta: 4, status: "Bán kết" },
  { entryId: "bot-paper", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -14, status: "Tứ kết" },
  { entryId: "bot-byte", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -16, status: "Tứ kết" },
  { entryId: "bot-minimax", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -19, status: "Tứ kết" },
  { entryId: "bot-gpt", played: 1, wins: 0, losses: 1, points: 0, eloDelta: -22, status: "Tứ kết" },
];

// ── Lịch sử trận ───────────────────────────────────────────
const FEED_IN_PROGRESS = [
  {
    id: "M-KBB-SF-01",
    round: "Bán kết",
    status: "live",
    startedAt: "21:00",
    a: "bot-alpha",
    b: "bot-neural",
    score: { a: 1, b: 1 },
    replayId: null,
  },
  {
    id: "M-KBB-QF-04",
    round: "Tứ kết",
    status: "done",
    startedAt: "20:15",
    a: "bot-scissor",
    b: "bot-byte",
    score: { a: 2, b: 0 },
    winnerId: "bot-scissor",
    replayId: "rp-9f24",
  },
  {
    id: "M-KBB-QF-03",
    round: "Tứ kết",
    status: "done",
    startedAt: "20:00",
    a: "bot-rock",
    b: "bot-minimax",
    score: { a: 2, b: 1 },
    winnerId: "bot-rock",
    replayId: "rp-9f23",
  },
  {
    id: "M-KBB-QF-02",
    round: "Tứ kết",
    status: "done",
    startedAt: "19:45",
    a: "bot-paper",
    b: "bot-neural",
    score: { a: 0, b: 2 },
    winnerId: "bot-neural",
    replayId: "rp-9f22",
  },
  {
    id: "M-KBB-QF-01",
    round: "Tứ kết",
    status: "done",
    startedAt: "19:30",
    a: "bot-alpha",
    b: "bot-gpt",
    score: { a: 2, b: 1 },
    winnerId: "bot-alpha",
    replayId: "rp-9f21",
  },
];

const FEED_COMPLETED = [
  {
    id: "M-KBB-FINAL",
    round: "Chung kết",
    status: "done",
    startedAt: "22:00",
    a: "bot-alpha",
    b: "bot-rock",
    score: { a: 2, b: 1 },
    winnerId: "bot-alpha",
    replayId: "rp-9f40",
    isFinal: true,
  },
  {
    id: "M-KBB-SF-02",
    round: "Bán kết",
    status: "done",
    startedAt: "21:20",
    a: "bot-rock",
    b: "bot-scissor",
    score: { a: 2, b: 0 },
    winnerId: "bot-rock",
    replayId: "rp-9f32",
  },
  {
    id: "M-KBB-SF-01",
    round: "Bán kết",
    status: "done",
    startedAt: "21:00",
    a: "bot-alpha",
    b: "bot-neural",
    score: { a: 2, b: 1 },
    winnerId: "bot-alpha",
    replayId: "rp-9f31",
  },
  ...FEED_IN_PROGRESS.filter((match) => match.id.startsWith("M-KBB-QF")),
];

// ── Nội dung dùng chung ────────────────────────────────────
const BASE_TOURNAMENT = {
  id: "TOUR-KBB-2026",
  code: "TOUR-KBB-2026",
  name: "Đại Chiến Kéo Búa Bao Mùa Xuân 2026",
  game: {
    id: "rps_chess",
    name: "Kéo · Búa · Bao Cờ",
    logo: "/logo/kbb_logo.webp",
    cover: "/game/kbb_game.png",
  },
  format: "single_elimination",
  formatLabel: "Single Elimination · 8 bot",
  organizer: {
    name: "Ban Tổ Chức BotVui",
    avatar: "/icons.png",
    contact: "tournament@botvui.dev",
  },
  prize: "5.000.000 VNĐ + Cúp Vô Địch",
  description:
    "Giải đấu bot chiến thuật KBB quy tụ 8 engine mạnh nhất cộng đồng. Mỗi trận Bo3, hòa sẽ replay tối đa 3 lần trước khi bước vào tiebreak.",
  entries: TOURNAMENT_ENTRIES,
  capacity: 8,
  rules: [
    "Bot phải viết bằng Python 3.11, Node.js 20 hoặc C++17.",
    "Thời gian suy nghĩ tối đa 500ms mỗi nước đi.",
    "Không được đọc file hệ thống hoặc gọi mạng trong lúc thi đấu.",
    "Kết quả do server chấm, BTC là trọng tài cuối cùng.",
  ],
  schedule: [
    { label: "Mở đăng ký", time: "20/10 · 08:00", done: true },
    { label: "Khóa đăng ký", time: "25/10 · 12:00", done: true },
    { label: "Khởi tranh vòng Tứ kết", time: "25/10 · 19:30", done: true },
    { label: "Bán kết & Chung kết", time: "25/10 · 21:00", done: false },
  ],
  myEntryId: "bot-alpha",
  mySubmission: {
    status: "draft",
    updatedAt: "22/10 · 09:12",
    source: "editor",
    fileName: "alphabot_v3.py",
    language: "python",
  },
  championId: null,
};

export const TOURNAMENT_FIXTURES = {
  // ── DRAFT: BTC đang soạn thể lệ, chưa mở đăng ký ──────────
  draft: {
    ...BASE_TOURNAMENT,
    status: "draft",
    statusLabel: "Bản nháp",
    statusHint: "BTC đang hoàn thiện thể lệ và cấu hình luật thi đấu",
    countdownTarget: "2026-10-28T19:00:00+07:00",
    countdownLabel: "Dự kiến mở đăng ký sau",
    registered: 0,
    entries: [],
    myEntryId: null,
    bracket: null,
    standings: [],
    feed: [],
    mySubmission: {
      status: "locked",
      updatedAt: null,
      source: null,
      fileName: null,
      language: "python",
    },
    notice: "Giải đấu chưa mở đăng ký. Bạn có thể lưu nháp bot để chuẩn bị trước.",
  },

  // ── OPEN: đang mở đăng ký ────────────────────────────────
  open: {
    ...BASE_TOURNAMENT,
    status: "open",
    statusLabel: "Đang mở đăng ký",
    statusHint: "Nộp bot trước khi khóa đăng ký để chắc chắn có suất thi đấu",
    countdownTarget: "2026-10-25T19:30:00+07:00",
    countdownLabel: "Khởi tranh sau",
    registered: 6,
    entries: TOURNAMENT_ENTRIES.slice(0, 6),
    bracket: null,
    standings: [],
    feed: [],
    mySubmission: {
      status: "ready",
      updatedAt: "22/10 · 09:12",
      source: "editor",
      fileName: "alphabot_v3.py",
      language: "python",
    },
    notice: "Bot đã sẵn sàng. Bạn vẫn có thể nộp lại trước 12:00 ngày 25/10.",
  },

  // ── IN_PROGRESS: đang thi đấu ────────────────────────────
  in_progress: {
    ...BASE_TOURNAMENT,
    status: "in_progress",
    statusLabel: "Đang diễn ra",
    statusHint: "Bán kết đang diễn ra — bot đã khóa, không thể nộp lại",
    countdownTarget: "2026-10-25T21:00:00+07:00",
    countdownLabel: "Trận kế tiếp sau",
    registered: 8,
    bracket: IN_PROGRESS_BRACKET,
    standings: STANDINGS_IN_PROGRESS,
    feed: FEED_IN_PROGRESS,
    mySubmission: {
      status: "locked",
      updatedAt: "25/10 · 18:40",
      source: "upload",
      fileName: "alphabot_v3.py",
      language: "python",
    },
    notice: "Bot của bạn đang thi đấu. Theo dõi trận trực tiếp ở bảng nhánh bên dưới.",
  },

  // ── COMPLETED: đã trao giải ──────────────────────────────
  completed: {
    ...BASE_TOURNAMENT,
    status: "completed",
    statusLabel: "Đã kết thúc",
    statusHint: "Giải đấu đã khép lại — chúc mừng quán quân Alpha Bot",
    countdownTarget: null,
    countdownLabel: null,
    registered: 8,
    bracket: COMPLETED_BRACKET,
    standings: STANDINGS_COMPLETED,
    feed: FEED_COMPLETED,
    championId: "bot-alpha",
    mySubmission: {
      status: "locked",
      updatedAt: "25/10 · 18:40",
      source: "upload",
      fileName: "alphabot_v3.py",
      language: "python",
    },
    notice: "Bot đã được chấm xong. Toàn bộ replay vẫn xem lại được trong lịch sử trận.",
  },
};

export function getTournamentFixture(statusKey) {
  return TOURNAMENT_FIXTURES[statusKey] ?? TOURNAMENT_FIXTURES.open;
}

// ── Thể thức Round Robin (mock để xem trước UI) ────────────
// Sinh lịch vòng tròn theo thuật toán xoay vòng (circle method)
export function buildRoundRobinRounds(players, { doneRounds = 0, liveRound = null } = {}) {
  const list = players.length % 2 === 0 ? [...players] : [...players, null];
  const rotation = [...list];
  const rounds = [];

  for (let roundIndex = 0; roundIndex < list.length - 1; roundIndex += 1) {
    const matches = [];

    for (let i = 0; i < list.length / 2; i += 1) {
      const a = rotation[i];
      const b = rotation[list.length - 1 - i];
      if (!a || !b) continue;

      const matchIndex = matches.length;
      const isDone = roundIndex < doneRounds;
      const isLive = liveRound === roundIndex && matchIndex === 0;
      const winnerA = (roundIndex + matchIndex) % 2 === 0;

      matches.push({
        matchKey: `r${roundIndex}m${matchIndex}`,
        roundIndex,
        matchIndex,
        participantAId: a.id,
        participantBId: b.id,
        winnerId: isDone ? (winnerA ? a.id : b.id) : null,
        status: isDone ? "done" : isLive ? "running" : "ready",
        score: isDone
          ? winnerA
            ? { a: 2, b: 1 }
            : { a: 1, b: 2 }
          : isLive
            ? { a: 1, b: 1 }
            : null,
        matchId: isDone || isLive ? `M-KBB-RR${roundIndex + 1}-${matchIndex + 1}` : null,
        replayId: isDone ? `rp-rr-${roundIndex + 1}${matchIndex + 1}` : null,
        startedAt: `2026-10-25T${19 + roundIndex}:${String(matchIndex * 15).padStart(2, "0")}:00+07:00`,
      });
    }

    rounds.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }

  return rounds;
}

export function buildRoundRobinFixture(base) {
  const count = base.registered > 0 ? base.registered : TOURNAMENT_ENTRIES.length;
  const players = TOURNAMENT_ENTRIES.slice(0, Math.max(2, count));
  const hasBracket = base.status === "in_progress" || base.status === "completed";

  const rounds = hasBracket
    ? buildRoundRobinRounds(players, {
        doneRounds: base.status === "completed" ? players.length : 2,
        liveRound: base.status === "in_progress" ? 2 : null,
      })
    : [];

  return {
    ...base,
    id: "TOUR-RR-2026",
    code: "TOUR-RR-2026",
    name:
      base.status === "completed"
        ? "Vòng Tròn KBB — Chung Kết Mùa Thu 2026"
        : "Vòng Tròn KBB — Tranh Cúp Mùa Thu 2026",
    format: "round_robin",
    formatLabel: `Round Robin · ${players.length} bot`,
    entries: players,
    capacity: players.length,
    registered: players.length,
    bracket: hasBracket ? { format: "round_robin", rounds, participants: players } : null,
    standings: [],
    feed: [],
    championId: null,
    mySubmission: {
      ...base.mySubmission,
      status: base.status === "open" ? "ready" : "locked",
    },
    notice:
      base.status === "open"
        ? "Đăng ký đang mở. Lịch vòng tròn sẽ được tạo ngay khi BTC khóa danh sách."
        : "Thể thức vòng tròn: bảng điểm cập nhật sau mỗi trận, 3 điểm cho mỗi trận thắng.",
  };
}

// ── Code mẫu cho Monaco ────────────────────────────────────
export const SAMPLE_BOT_SOURCE = `from engine.rps_chess import Bot, Move

class AlphaBot(Bot):
    """Bot mẫu: ưu tiên chiếm base, né bẫy và phản đòn theo lịch sử đối thủ."""

    def __init__(self):
        super().__init__(name="Alpha Bot")
        self.history = []

    def on_turn(self, state):
        self.history.append(state.last_move)
        if len(self.history) > 12:
            self.history.pop(0)

        # 1. Nếu đang đứng cạnh base đối thủ -> kết liễu ngay
        if state.can_capture_base:
            return Move.attack_base()

        # 2. Né bẫy và ô nguy hiểm trước
        safe_moves = [m for m in state.legal_moves if not m.is_trap]
        if safe_moves:
            return self.pick_aggressive(safe_moves)

        # 3. Phòng thủ: lùi về base nhà
        return state.fallback_move()

    def pick_aggressive(self, moves):
        return max(moves, key=lambda m: m.pressure_score)


bot = AlphaBot()
`;

export const LANGUAGE_OPTIONS = [
  { id: "python", label: "Python 3.11", ext: ".py", template: SAMPLE_BOT_SOURCE },
  {
    id: "javascript",
    label: "Node.js 20",
    ext: ".js",
    template: `// Bot mẫu JavaScript cho Kéo · Búa · Bao Cờ
export default function createBot() {
  return {
    name: "Alpha Bot JS",
    onTurn(state) {
      if (state.canCaptureBase) return state.attackBase();
      const safe = state.legalMoves.filter((move) => !move.isTrap);
      return (safe.length ? safe : state.legalMoves)
        .sort((a, b) => b.pressureScore - a.pressureScore)[0];
    },
  };
}
`,
  },
  {
    id: "cpp",
    label: "C++17",
    ext: ".cpp",
    template: `// Bot mẫu C++17 cho Kéo · Búa · Bao Cờ
#include "engine/rps_chess.hpp"

class AlphaBot : public rps::Bot {
 public:
  rps::Move OnTurn(const rps::State& state) override {
    if (state.can_capture_base) return rps::Move::AttackBase();
    rps::Move best = state.legal_moves[0];
    for (const auto& move : state.legal_moves) {
      if (!move.is_trap && move.pressure_score > best.pressure_score) best = move;
    }
    return best;
  }
};

REGISTER_BOT(AlphaBot)
`,
  },
];
