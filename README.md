# Đấu Trường Kéo Búa Bao 🎮

> **Nền tảng đấu Game Bot** — Nơi những dòng code đối đầu!

Một nền tảng game đa năng cho phép người chơi viết bot Python (`.py`) và đấu với nhau theo thời gian thực. Hỗ trợ nhiều thể loại game: đối kháng chiến thuật, săn mồi, giải đố...

## 🎯 Tổng quan

| Thành phần      | Công nghệ                                    |
| --------------- | -------------------------------------------- |
| **Frontend**    | React 19 + Vite 8                            |
| **Backend**     | Node.js ≥ 24 (thuần, không framework)        |
| **Game Engine** | Python 3 (multiprocessing)                   |
| **Database**    | PostgreSQL (production) / SQLite (local)     |
| **Realtime**    | WebSocket (giao thức v2)                     |
| **Deploy**      | Docker, Railway (backend), Vercel (frontend) |

## 🎮 Các game

| Game                   | ID             | Loại   | Mô tả                                                    |
| ---------------------- | -------------- | ------ | -------------------------------------------------------- |
| **Kéo · Búa · Bao Cờ** | `rps_chess`    | Server | Bot điều khiển quân cờ, phân giải va chạm bằng oẳn tù tì |
| **Rắn Săn Mồi**        | `snake_battle` | Server | Bot điều khiển rắn, ăn mồi, tránh chướng ngại vật        |
| **Pikachu Puzzle**     | `pikachu`      | Client | Game giải đố cổ điển, chạy hoàn toàn trên trình duyệt    |

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────┐
│                  Frontend (React)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Lobby   │  │   Room   │  │  Match View  │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (v2)
┌──────────────────────▼──────────────────────────┐
│              Backend Node.js (net/)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  WS GW   │  │  HTTP    │  │  MatchMaker  │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Engine  │  │  Rating  │  │ Tournament   │  │
│  │  Runner  │  │  Service │  │  Scheduler   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└──────┬──────────────────────────────────────────┘
       │ STDIN/STDOUT (NDJSON)
┌──────▼──────────────────────────────────────────┐
│           Python Game Engine (engine/)           │
│  ┌────────────────┐  ┌──────────────────────┐   │
│  │  match_runner  │  │  snake/match_runner  │   │
│  └────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 🚀 Bắt đầu nhanh

### Yêu cầu

- **Node.js** ≥ 24.0.0
- **pnpm** 11.25.0 (bật `corepack enable`)
- **Python** 3 (kiểm tra với `python --version` hoặc `python3 --version`)
- **PostgreSQL** (tùy chọn — local dùng SQLite)

### Cài đặt

```bash
# 1. Clone repository
git clone <repo-url>
cd ltm-grp-5-prj2

# 2. Cài dependencies
pnpm install

# 3. Tạo file môi trường
cp .env.example .env

# 4. (Tùy chọn) Cấu hình Python
# Sửa PYTHON_EXECUTABLE trong .env nếu cần
# Windows: py
# macOS/Linux: python3
```

### Chạy local

```bash
# Chạy backend server (cổng 3000)
pnpm run server

# Mở terminal khác — chạy frontend dev
pnpm run dev
```

Mở trình duyệt tại `http://localhost:5173`.

### Chạy toàn bộ hệ thống (1 lệnh)

```bash
pnpm run dev:all
```

### Kiểm thử

```bash
pnpm test
```

## 📦 Deploy

### Docker

```bash
docker build -t game-platform .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e GOOGLE_CLIENT_ID=... \
  game-platform
```

### Railway (backend)

1. Tạo service từ thư mục gốc repository
2. Dockerfile tự động cài Node.js + Python 3
3. Đặt các biến môi trường trong Railway Dashboard

### Vercel (frontend)

1. Kết nối repository, framework preset: **Vite**
2. Build command: `pnpm build`
3. Output: `dist`
4. Đặt `VITE_API_URL` trỏ tới backend Railway

## 🔐 Xác thực

| Phương thức      | Mô tả                                              |
| ---------------- | -------------------------------------------------- |
| **Google OAuth** | Đăng nhập bằng tài khoản Google                    |
| **Guest**        | Đăng nhập nhanh với tên hiển thị (chỉ chơi casual) |

## 🏆 Tính năng

- **Xếp hạng (Elo)** — Tính điểm và xếp hạng người chơi sau mỗi trận ranked
- **Giải đấu** — Hỗ trợ thể thức loại trực tiếp (single elimination) và vòng tròn (round robin)
- **Xem trực tiếp** — Spectator mode: xem trận đấu đang diễn ra theo thời gian thực
- **Lưu trận & phát lại** — Lưu trận đấu và xem lại bất kỳ lúc nào
- **Tìm trận (Matchmaking)** — Tự động ghép cặp người chơi cùng trình độ

## 📁 Cấu trúc thư mục

```
├── engine/              # Python game engines
│   ├── game_engine.py   # Engine Kéo Búa Bao Cờ
│   ├── match_runner.py  # Runner chính
│   ├── snake/           # Engine Rắn Săn Mồi
│   └── tests/           # Kiểm thử engine
├── games/               # Game manifests
│   ├── pikachu/         # Pikachu Puzzle
│   ├── rps-chess/       # Kéo Búa Bao Cờ
│   └── snake/           # Rắn Săn Mồi
├── net/                 # Backend Node.js
│   ├── index.js         # Entry point
│   ├── config.js        # Cấu hình
│   ├── http.js          # HTTP server
│   ├── wsGateway.js     # WebSocket gateway
│   ├── botGateway.js    # Bot submission
│   ├── roomGateway.js   # Phòng chờ
│   ├── orchestrator.js  # Điều phối trận đấu
│   ├── engineRunner.js  # Gọi Python engine
│   ├── matchmaking/     # Ghép trận
│   ├── auth/            # Xác thực
│   ├── storage/         # Lưu trữ
│   ├── application/     # Nghiệp vụ (rating, tournament)
│   └── infrastructure/  # Persistence (Postgres, SQLite)
├── public/              # Static assets
├── scripts/             # Scripts tiện ích
├── shared/              # Code dùng chung
├── src/                 # Frontend React
└── test/                # Kiểm thử backend
```

## 📚 Tài liệu

| Tài liệu                                           | Mô tả                             |
| -------------------------------------------------- | --------------------------------- |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md)             | Giao thức giao diện ↔ server (v1) |
| [`docs/WS_PROTOCOL_V2.md`](docs/WS_PROTOCOL_V2.md) | Giao thức WebSocket v2 (hiện tại) |
| [`docs/match-storage.md`](docs/match-storage.md)   | Lưu trữ trận đấu & bảng xếp hạng  |
| [`engine/README.md`](engine/README.md)             | Hướng dẫn engine Kéo Búa Bao Cờ   |
| [`engine/snake/README.md`](engine/snake/README.md) | Hướng dẫn viết bot Rắn Săn Mồi    |

## 🐍 Viết bot

Mỗi game có hợp đồng bot riêng. Xem hướng dẫn chi tiết tại:

- [Hướng dẫn bot Rắn Săn Mồi](engine/snake/README.md)
- [Hướng dẫn bot Kéo Búa Bao Cờ](engine/README.md)

### Bot mẫu

```
engine/
├── bot_sample_1.py       # Bot KBB ngẫu nhiên
├── bot_sample_2.py       # Bot KBB tham lam
├── bot_sample_3.py       # Bot KBB mẫu 3
├── bot_sample_4.py       # Bot KBB mẫu 4
└── snake/
    ├── bot_sample_greedy.py  # Bot rắn tham lam
    └── bot_sample_random.py  # Bot rắn ngẫu nhiên
```

## 🛠️ Scripts

| Script             | Mô tả                      |
| ------------------ | -------------------------- |
| `pnpm run dev`     | Chạy frontend dev server   |
| `pnpm run dev:all` | Chạy cả frontend + backend |
| `pnpm run server`  | Chạy backend server        |
| `pnpm run build`   | Build frontend production  |
| `pnpm test`        | Chạy tất cả kiểm thử       |
| `pnpm run preview` | Preview bản build          |

## 👥 Đóng góp

Dự án được phát triển bởi nhóm **LTM-GRP-5-PRJ2**.

## 📄 Giấy phép

Private — Nội bộ nhóm học tập.
