# 🎮 BotVui — Đấu Trường Game Bot

Nền tảng thi đấu game bot nhiều người chơi: viết bot Python, nộp lên, xem bot của bạn đấu trực tiếp.

---

## Tính năng

- **Hai game:** Oẳn Tù Tì Trên Bàn Cờ (`rps_chess`) và Rắn Săn Mồi (`snake_battle`)
- **Chế độ chơi:** Casual (phòng riêng), Ranked (ghép trận + Elo), Tournament (giải đấu có nhánh đấu)
- **Xem trận trực tiếp & replay** — cùng định dạng, cùng bộ renderer
- **Đăng nhập:** Khách, Email/mật khẩu, Google, Facebook
- **Giải đấu:** Single elimination, Round robin; chủ giải tự tạo/quản lý; tự động khởi tranh theo lịch
- **Chơi người thật** (không bắt buộc phải có bot): chọn chế độ `human` trong phòng

---

## Tech Stack

| Lớp | Công nghệ |
|---|---|
| Frontend | React 19, Vite 8, CSS thuần |
| Backend | Node.js ≥ 24, `ws`, `http` (không framework) |
| Game Engine | Python 3 (stdlib only), subprocess/multiprocessing |
| Database | SQLite (local) / PostgreSQL (deploy) |
| Auth | Session token (scrypt), Google OAuth, Facebook OAuth |
| Deploy | Docker (Node 24 + Python 3) → Railway; Frontend → Vercel |

---

## Cài đặt & chạy local (Windows)

### Điều kiện cần

- **Node.js ≥ 24** — kiểm tra: `node -v`
- **Python 3** — kiểm tra: `python --version` (Windows) hoặc `python3 --version` (macOS/Linux)
- **pnpm** (tùy chọn, dùng lock file): `npm i -g pnpm` — hoặc dùng `npm` thường cũng được

### Bước 1 — Cài dependencies

```powershell
npm install
```

### Bước 2 — Cấu hình môi trường

```powershell
Copy-Item .env.example .env
```

Chỉnh `.env` nếu cần (xem bảng bên dưới). Mặc định đã dùng được ngay.

### Bước 3 — Chạy cùng lúc Backend + Frontend

```powershell
npm run dev:all
```

Lệnh này tự khởi backend (cổng 3000) và Vite dev server (cổng 5175+), rồi in link ra console.

> **Hoặc chạy riêng từng service:**
> ```powershell
> # Terminal 1 — Backend
> npm run server
>
> # Terminal 2 — Frontend
> npm run dev
> ```

### Bước 4 — Chạy test

```powershell
npm test
```

---

## Biến môi trường (`.env`)

Sao chép `.env.example` thành `.env`. Không cần chỉnh gì để chạy local cơ bản.

| Biến | Mô tả | Mẫu / Mặc định |
|---|---|---|
| `PORT` | Cổng backend | `3000` |
| `VITE_WS_URL` | URL WebSocket cho frontend | `ws://localhost:3000` |
| `VITE_API_URL` | URL HTTP API cho frontend (để trống → Vite proxy) | _(trống)_ |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID (public) | _(để trống nếu không cần Google login)_ |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL (để trống → dùng SQLite) | _(trống)_ |
| `DB_PATH` | Đường dẫn SQLite | `data/game.sqlite` |
| `PYTHON_EXECUTABLE` | Lệnh Python | `py` (Windows) / `python3` (Linux) |
| `GOOGLE_CLIENT_ID` | Client ID xác minh phía server | _(chỉ đặt ở backend)_ |
| `FACEBOOK_APP_ID` | Facebook App ID | _(chỉ đặt ở backend)_ |
| `FACEBOOK_APP_SECRET` | Facebook App Secret | _(chỉ đặt ở backend, không đưa lên frontend)_ |
| `AUTH_ALLOW_GUEST` | `0` để tắt đăng nhập khách | `1` |
| `MAX_CONCURRENT_MATCHES` | Số trận chạy đồng thời | `1` |
| `MAX_QUEUED_MATCHES` | Số trận chờ trong hàng đợi | `24` |

---

## Cấu trúc thư mục

```
├── net/                  # Backend Node.js
│   ├── index.js          # Entry point — khởi tạo tất cả services
│   ├── http.js           # HTTP server, toàn bộ REST API
│   ├── wsGateway.js      # WebSocket v2: auth, queue, phòng, match
│   ├── roomGateway.js    # WebSocket v1 (còn dùng song song)
│   ├── engineRunner.js   # Gọi Python engine qua subprocess
│   ├── auth/             # Đăng nhập: session, Google, Facebook, email/password
│   ├── storage/          # matchStore (SQLite/PostgreSQL), schema.sql
│   ├── matchmaking/      # Hàng đợi ghép trận, Elo tạm thời
│   ├── application/      # RatingService, TournamentService
│   └── infrastructure/   # Repository implementations (SQLite, Postgres)
│
├── engine/               # Python game engine — Oẳn Tù Tì Trên Bàn Cờ
│   ├── game_engine.py    # Logic game, va chạm, bot process
│   ├── match_runner.py   # Chạy một trận, xuất replay.json
│   ├── config.json       # Cấu hình bàn cờ mặc định
│   ├── bot_sample_*.py   # Bot mẫu
│   └── snake/            # Python game engine — Rắn Săn Mồi
│       ├── snake_engine.py
│       ├── match_runner.py
│       └── config.json
│
├── src/                  # Frontend React
│   ├── App.jsx           # Routing (hash-based), layout chính
│   ├── api.js            # Tất cả lời gọi HTTP API
│   ├── hooks/useRoom.js  # Hook kết nối WebSocket, quản lý phòng
│   ├── hooks/useAuth.js  # Hook đăng nhập/đăng xuất
│   ├── pages/            # Các trang: Home, GameLobby, Room, Match, Replay...
│   ├── games/            # Component render từng game (rps_chess, snake_battle)
│   └── components/       # UI dùng chung, tournament widgets
│
├── games/                # Game manifests (backend + frontend đọc chung)
│   ├── rps-chess/
│   └── snake/
│
├── shared/               # Code dùng chung BE+FE (protocol events, tournament domain)
├── test/                 # Test Node.js (node --test)
├── scripts/              # Tiện ích: dev-all.js, seed data, check scripts
├── docs/                 # Tài liệu chi tiết
│   ├── WS_PROTOCOL_V2.md # Giao thức WebSocket v2
│   ├── PROTOCOL.md       # Giao thức v1 (legacy)
│   └── match-storage.md  # Database, API, replay storage
├── Dockerfile            # Node 24 + Python 3
└── .env.example          # Mẫu biến môi trường
```

---

## Viết & thử bot

### Oẳn Tù Tì Trên Bàn Cờ (`rps_chess`)

Bot là một file `.py` có hàm:

```python
def make_move(board_state, my_pieces, opponent_pieces, config):
    # Trả về: {"piece_id": "A1", "action_type": "MOVE", "to": [x, y]}
    # Hoặc None để bỏ lượt
```

Thử bot trực tiếp (không cần server):

```powershell
python engine/match_runner.py --bot-a engine/bot_sample_1.py --bot-b engine/bot_sample_2.py
```

### Rắn Săn Mồi (`snake_battle`)

```python
def make_move(board_state, my_pieces, opponent_pieces, config):
    # Trả về: {"action_type": "MOVE", "direction": "UP"}  # UP | DOWN | LEFT | RIGHT
```

```powershell
python engine/snake/match_runner.py --bot-a engine/snake/bot_sample_greedy.py --bot-b ./bot_cua_ban.py
```

> **Windows:** luôn chạy qua `match_runner.py` (cần `if __name__ == "__main__":` trong bot nếu có code cấp module).

---

## WebSocket API (v2)

Kết nối: `ws://<host>/ws`

**Luồng cơ bản:**

```
1. Mở kết nối
2. Gửi: {"type": "auth", "token": "<session_token>"}
3. Nhận: {"type": "auth_ok", "user": {...}}
4. Gửi: {"type": "find_match", "game_id": "rps_chess", "mode": "casual"}
5. Nhận: {"type": "match_found", "room_id": "K7QD", ...}
6. Gửi: {"type": "submit_bot", "mode_type": "code", "language": "python", "content": "def make_move..."}
7. Nhận: {"type": "bot_accepted"}
8. Gửi: {"type": "ready", "ready": true}
9. Nhận: {"type": "countdown", "seconds": 3} → match_start → turn × N → game_over
```

Xem chi tiết: [`docs/WS_PROTOCOL_V2.md`](docs/WS_PROTOCOL_V2.md)

---

## REST API chính

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/auth/guest` | Đăng nhập khách |
| `POST` | `/api/auth/register` | Đăng ký email/password |
| `POST` | `/api/auth/login` | Đăng nhập email/password |
| `POST` | `/api/auth/google` | Đăng nhập Google |
| `GET` | `/api/me` | Thông tin người dùng hiện tại |
| `GET` | `/api/games` | Danh sách game đang hoạt động |
| `GET` | `/api/matches` | Lịch sử trận (`?teamId=&status=&limit=&offset=`) |
| `GET` | `/api/matches/:id/replay` | Dữ liệu replay đầy đủ |
| `GET` | `/api/rankings` | Bảng xếp hạng |
| `GET` | `/api/tournaments` | Danh sách giải đấu |
| `POST` | `/api/tournaments` | Tạo giải (cần đăng nhập) |
| `GET` | `/health` | Health check |

Backend chấp nhận cả `/api/*` và `/api/v1/*`.

---

## Deploy

### Docker (Backend)

```dockerfile
# Dockerfile đã có sẵn — Node 24 + Python 3
docker build -t botvui .
docker run -p 3000:3000 --env-file .env botvui
```

### Railway + Vercel (cấu hình đề xuất)

- **Backend** → Railway: deploy từ `Dockerfile`, đặt các biến server trong Railway dashboard
- **Frontend** → Vercel: `npm run build` → deploy thư mục `dist`, đặt `VITE_API_URL` trỏ tới Railway origin

### Migrate SQLite → PostgreSQL

```powershell
# Đặt DATABASE_URL trong .env trỏ tới PostgreSQL, rồi:
node net/storage/migrateSqliteToPostgres.js
```

---

## Công cụ & scripts hữu ích

```powershell
# Seed 3 trận ví dụ vào database (không ảnh hưởng điểm)
node scripts/seed-replay-examples.mjs

# Tạo dữ liệu demo lịch sử
node scripts/create-demo-history.mjs

# Nhập replay từ engine Python vào database
node net/importReplay.js engine/replay.json
node net/importReplay.js engine/replay.json --unranked  # không tính điểm
```

---

## Giấy phép

Dự án nội bộ nhóm LTM-GRP-5 — Chưa có giấy phép công khai.
