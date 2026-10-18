# Giao thức WebSocket v2 — Nền tảng đấu Game Bot

Phiên bản: 2.0 (dựa trên "Thiết kế nền tảng đấu game v2", mục 5)
Người phụ trách: Vinh (Backend WS)
Thay thế phần WebSocket của `docs/PROTOCOL.md` (v1, theo mã phòng).

## 1. Quy ước chung

- Một kết nối WebSocket duy nhất: `wss://<host>/ws`. Dùng cho đăng nhập, tìm trận, phòng và xem trận.
- Mỗi tin là một object JSON: `{ "type": "...", ...dữ liệu }`. Server luôn kèm `"v": 2`. Client có thể kèm `"v": 2`; số khác bị từ chối (`UNSUPPORTED_PROTOCOL`).
- Server là trọng tài. Client chỉ gửi ý định, kết quả do server quyết định.
- Mọi tin lỗi có dạng `{ "type": "error", "code": "...", "message": "..." }` (mục 6).
- Token không đặt trên URL (tránh lộ trong log). Client lấy token bằng HTTP (mục 2) rồi gửi tin `auth` ngay sau khi mở kết nối.
- `game_id`: định danh game (ví dụ `"rps_chess"`). `mode`: `"casual" | "ranked" | "tournament"`.
- Bot chỉ chạy Python (`.py`) ở giai đoạn này. Các đuôi khác bị từ chối bằng `UNSUPPORTED_LANGUAGE`.

## 2. Đăng nhập (HTTP) và vòng đời kết nối

Token phiên lấy qua HTTP, cùng origin với API:

| Yêu cầu | Body | Kết quả |
|---|---|---|
| `POST /api/auth/google` | `{ "id_token": "<Google ID token>" }` | `200 { token, user }`. Server xác minh với Google, kiểm tra `aud = GOOGLE_CLIENT_ID`. Sai: `401 INVALID_ID_TOKEN`. Chưa cấu hình: `503 GOOGLE_NOT_CONFIGURED` |
| `POST /api/auth/guest` | `{ "display_name": "1-30 ký tự" }` | `200 { token, user }`. Khách chỉ chơi `casual` (đặt `AUTH_ALLOW_GUEST=0` để tắt: `403 GUEST_DISABLED`) |
| `GET /api/me` | header `Authorization: Bearer <token>` | `200 { user }` hoặc `401 INVALID_TOKEN` |

`user` = `{ id, display_name, avatar_url, guest }`. Token sống 24 giờ.

```
connected ──auth──► authed ──find_match──► queued ──match_found──► in_room
                      │                                              │
                      └────────join_room / create_room───────────────┤
in_room:  waiting ─► countdown ─► playing ─► finished ─► (authed)
```

- Phải `auth` trong 10 giây, nếu không server đóng kết nối (`AUTH_TIMEOUT`).
- Chưa `auth` mà gửi tin khác: `NOT_AUTHENTICATED`.
- Mỗi tài khoản chỉ có một kết nối đang hoạt động. Kết nối mới thay kết nối cũ (cũ nhận `REPLACED`).
- Mất kết nối khi đang trong phòng: giữ chỗ 30 giây. Vào lại bằng `auth` rồi `join_room` cùng mã thì khôi phục.

## 3. Client → Server

| type | Trường | Hợp lệ khi | Ý nghĩa |
|---|---|---|---|
| `auth` | `token` (chuỗi phiên do server cấp sau đăng nhập Google) | mới kết nối | Đăng nhập kết nối WS |
| `find_match` | `game_id`, `mode` (`casual` hoặc `ranked`) | authed | Vào hàng đợi ghép trận |
| `cancel_match` | — | queued | Rời hàng đợi |
| `create_room` | `game_id`, `mode: "casual"`, `config?` | authed | Tạo phòng riêng (mã 4 ký tự) |
| `join_room` | `game_id`, `mode`, `code` (`[A-Z0-9]{4}`) | authed | Vào phòng theo mã. Với `ranked`/`tournament` chỉ nhận mã server đã cấp |
| `watch_room` | `code` | authed | Xem phòng với tư cách khán giả (mọi chế độ). Nhận `room_state` và, nếu trận đang chạy, toàn bộ `match_start` và `turn` đã phát |
| `leave_room` | — | in_room, chưa `playing` | Rời phòng, nhả chỗ ngay |
| `submit_bot` | `mode_type: "code" \| "file"`, `language: "python"`, `filename?`, `content` | in_room, chưa `playing` | Nộp thuật toán (xem mục 5) |
| `ready` | `ready: true \| false` | in_room, đã nộp bot | Báo sẵn sàng |
| `ping` | — | bất kỳ | Giữ kết nối |

`config` trong `create_room` chỉ áp dụng cho `casual`. Game `rps_chess` cho chỉnh `max_turns` (1 đến 300, mặc định 100) và `bot_time_ms` (100 đến 5000, mặc định 1000). Khóa lạ bị bỏ qua, giá trị ngoài khoảng bị từ chối bằng `INVALID_MESSAGE`. Phòng ghép tự động luôn dùng cấu hình mặc định.

## 4. Server → Client

| type | Trường | Ý nghĩa |
|---|---|---|
| `auth_ok` | `user: {id, display_name, avatar_url}` | Đăng nhập kết nối thành công |
| `queue_state` | `in_queue`, `wait_time` (giây), `mode`, `game_id` | Gửi khi vào hàng đợi, rồi mỗi 2 giây, và một lần cuối với `in_queue:false` khi rời |
| `match_found` | `room_id` (mã phòng), `game_id`, `mode`, `opponent: {id, display_name, rating?}` | Đã ghép được. Server tự đưa cả hai vào phòng, client không cần `join_room` |
| `room_state` | `room_id`, `status`, `config`, `players: [{user_id, display_name, team_id, has_bot, ready, connected}]`, `spectators` | Trạng thái phòng, gửi lại mỗi khi có thay đổi |
| `bot_accepted` | `version`, `bytes`, `sha256` | Bot đã qua kiểm tra, kèm số phiên bản của lần nộp |
| `countdown` | `seconds` (hoặc `null` nếu hủy) | Đếm ngược trước trận |
| `match_start` | `match_id`, `game_id`, `mode`, `match_info`, `game_config`, `initial_state` | Bắt đầu trận. Ba trường cuối đúng định dạng đầu file `replay.json` |
| `turn` | `turn: { turn, player, actions[], events[] }` | Mỗi lượt, `turn` là một phần tử của `turns[]` trong replay |
| `room_left` | — | Xác nhận đã xử lý `leave_room` |
| `game_over` | `match_id`, `winner` (`"team_a" \| "team_b" \| "draw"`), `reason`, `elo_change_a?`, `elo_change_b?` | Kết thúc. Hai trường Elo chỉ có khi `mode = ranked` |
| `error` | `code`, `message` | Xem mục 6 |
| `pong` | — | Trả lời `ping` |

`match_end` trong giao thức v1 được đổi tên thành `game_over`. `status` của phòng: `waiting`, `countdown`, `playing`, `finished`. `game_over` luôn đến trước `room_state` có `status: "finished"`.

Thứ tự khi trận lỗi: `room_state` (về `waiting`) rồi mới đến `error` `MATCH_FAILED`, vì giao diện xóa lỗi mỗi khi nhận `room_state`.

## 5. Nộp bot qua WebSocket

Thay cho `POST /api/rooms/:code/submissions` của v1.

- `mode_type: "code"`: nội dung từ trình soạn thảo trên web. `mode_type: "file"`: nội dung tệp tải lên. Hai loại được xử lý như nhau trên server.
- `content` là chuỗi UTF-8, tối đa **100 KB** ở giai đoạn đầu. `filename` chỉ bắt buộc khi `mode_type = "file"` (dạng `[A-Za-z0-9_-]{1,50}.py`); với `code` server dùng `bot.py`. Muốn tăng lên (PDF ghi 5 MB) thì phải đồng thời đặt giới hạn thời gian chạy và có sandbox.
- Kiểm tra: đúng ngôn ngữ, UTF-8, biên dịch được cú pháp (`ast.parse`) và có hàm `make_move`. Sai thì trả `INVALID_BOT` kèm `message` mô tả, không tính là lỗi nghiêm trọng.
- Mỗi lần nộp tạo một phiên bản mới (`version` tăng dần theo `user_id`, `game_id`). Chỉ phiên bản mới nhất trước khi `ready` được dùng thi đấu.
- Nộp lại khi đang `ready`: server tự đặt lại `ready = false`.

## 6. Mã lỗi

| code | Khi nào |
|---|---|
| `INVALID_MESSAGE` | Không phải JSON, thiếu hoặc sai kiểu trường |
| `UNKNOWN_TYPE` | Loại tin không tồn tại hoặc không được phép gửi theo hướng này |
| `UNSUPPORTED_PROTOCOL` | `v` khác 2 |
| `RATE_LIMITED` | Gửi quá nhiều tin (trừ `ping`) |
| `NOT_AUTHENTICATED` / `AUTH_TIMEOUT` / `INVALID_TOKEN` | Chưa hoặc sai đăng nhập |
| `REPLACED` | Tài khoản mở kết nối mới |
| `UNKNOWN_GAME` | `game_id` không có trong danh sách game đang bật |
| `MODE_NOT_ALLOWED` | Chế độ không phù hợp thao tác (ví dụ `create_room` ở `ranked`) |
| `ALREADY_QUEUED` / `NOT_QUEUED` | Vào hàng đợi hai lần, hoặc hủy khi không ở hàng đợi |
| `ALREADY_IN_ROOM` / `NOT_IN_ROOM` | Trạng thái không khớp |
| `ROOM_NOT_FOUND` / `ROOM_FULL` | Mã phòng sai, phòng đủ người |
| `WRONG_STATE` | Thao tác không hợp lệ ở trạng thái hiện tại (ví dụ nộp bot khi đang `playing`) |
| `UNSUPPORTED_LANGUAGE` / `INVALID_BOT` / `BOT_TOO_LARGE` | Lỗi khi nộp bot |
| `NO_BOT` | `ready` khi chưa nộp bot |
| `MATCH_FAILED` | Engine lỗi, trận bị hủy và không tính Elo |

## 7. Luật theo chế độ

| | casual | ranked | tournament |
|---|---|---|---|
| Vào phòng | `find_match` hoặc mã phòng | chỉ `find_match` | server xếp phòng theo lịch giải |
| Cấu hình | tuỳ chỉnh qua `config` | cố định `default_config` | BTC khóa |
| Elo | không | có, báo trong `game_over` | theo BTC |
| Nộp bot | tự do đến khi `playing` | tự do đến khi `playing` | phải nộp trước hạn chót đăng ký |
| Rời hoặc mất kết nối giữa trận | không ảnh hưởng | không ảnh hưởng | không ảnh hưởng |
| Lưu vào `/api/rankings` | không | có | theo BTC |

Ghi chú về rời giữa trận: bot chạy **trên server**, nên trận vẫn chạy tới hết dù người chơi mất kết nối, và `leave_room` bị từ chối (`WRONG_STATE`) trong lúc `countdown`/`playing`. Mất kết nối ngoài trận thì giữ chỗ 30 giây. Vào lại bằng `auth` là tự khôi phục, và nếu trận đang chạy thì nhận lại `room_state` cùng các tin `match_start`, `turn` đã phát.

Phòng `ranked` do hàng đợi tạo chỉ nhận đúng hai người đã được ghép. Khách (guest) bị từ chối `find_match` ở `ranked` với `MODE_NOT_ALLOWED`.

## 8. Ví dụ: hai máy ghép trận ranked

```
A→S  {"type":"auth","token":"…"}                         S→A  {"type":"auth_ok","user":{…}}
B→S  {"type":"auth","token":"…"}                         S→B  {"type":"auth_ok","user":{…}}
A→S  {"type":"find_match","game_id":"rps_chess","mode":"ranked"}
                                                         S→A  {"type":"queue_state","in_queue":true,"wait_time":0}
B→S  {"type":"find_match","game_id":"rps_chess","mode":"ranked"}
                                                         S→A,B {"type":"match_found","room_id":"K7QD","opponent":{…}}
                                                         S→A,B {"type":"room_state","status":"waiting",…}
A→S  {"type":"submit_bot","mode_type":"code","language":"python","content":"def make_move(…)…"}
                                                         S→A  {"type":"bot_accepted","version":1,…}
A→S  {"type":"ready","ready":true}      B làm tương tự
                                                         S→A,B {"type":"countdown","seconds":3} … {"seconds":1}
                                                         S→A,B {"type":"match_start",…}
                                                         S→A,B {"type":"turn","turn":1,…} … (lặp)
                                                         S→A,B {"type":"game_over","winner":"team_a","reason":"BASE_CAPTURED","elo_change_a":16,"elo_change_b":-16}
```

## 9. Thay đổi so với PDF v2 và so với v1

- Thêm: `auth`, `auth_ok`, `cancel_match`, `create_room`, `leave_room`, `ready`, `room_state`, `bot_accepted`, `countdown`, `match_start`, `turn`, `ping/pong`, bảng lỗi và máy trạng thái.
- `match_found` gửi `room_id`, đồng thời server tự đưa hai người vào phòng.
- Thêm `watch_room` (khán giả) và `room_left`. `match_start`, `turn` giữ đúng hình dạng của engine/replay.
- `submit_bot` chuyển từ HTTP POST sang WS, thêm `language`, `filename`, giới hạn và phiên bản.
- `match_end` (v1) đổi thành `game_over`. `join_room` bỏ `team_name`, `role`: danh tính lấy từ tài khoản đã đăng nhập.
- Đường `WS /rooms/<code>` và `POST /api/rooms/...` của v1 giữ đến khi Ngân đổi xong giao diện, sau đó bỏ.

## 10. Trạng thái triển khai và việc còn lại

Đã có trong `net/` (cổng `/ws`, file `net/wsGateway.js`): đăng nhập khách và Google, token phiên, hàng đợi casual/ranked, tạo/vào/xem phòng, `submit_bot` kèm kiểm tra cú pháp bằng `ast.parse`, đếm ngược, chạy engine, `game_over` kèm Elo, giữ chỗ khi mất kết nối. Giao thức v1 (`/rooms/<mã>`) vẫn chạy song song.

Còn lại, cần người phụ trách:

1. **Hoàng:** thay `net/auth/userStore.js` (bộ nhớ) bằng bảng `users`, `auth_identities`; lưu `game_id`, `mode`, `user_id` vào bảng `matches`.
2. **Huy:** thay `net/matchmaking/ratings.js` (Elo K=32 tạm, lưu bộ nhớ) bằng bản chính thức có lưu DB.
3. **Ngân:** nút đăng nhập Google (gửi `id_token` tới `POST /api/auth/google`) và nút tìm trận `ranked`. Giao diện hiện chỉ dùng khách và `casual`.
4. **Cả nhóm:** giới hạn bot 100 KB (PDF ghi 5 MB), chỉ Python (PDF ghi thêm `.js`, `.cpp`), và sandbox cho bot (chưa có).
