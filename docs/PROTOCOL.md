# Giao thức giao diện ↔ server

Giao diện chỉ là **người xem + người điều khiển phòng**. Code Python của hai đội được gửi lên server; engine Python là trọng tài và phát diễn biến trận qua WebSocket.

## Chạy local

- Chạy server: `npm run server` (mặc định cổng `3000`).
- Chạy giao diện: `npm run dev`.
- Sao chép `.env.example` thành `.env`. Để `VITE_API_URL` trống trong local để Vite proxy HTTP API tới cổng `3000`.
- Cần cài Python và bảo đảm lệnh `python` (Windows) hoặc `python3` (macOS/Linux) chạy được. Có thể đặt `PYTHON_EXECUTABLE` để chọn lệnh Python cụ thể.
- Backend Railway dùng `Dockerfile` ở thư mục gốc để cài cả Node.js và Python 3; cần triển khai service backend từ thư mục gốc repository.
- Đặt `VITE_USE_MOCK=true` để dùng replay mẫu thay vì kết nối server.

## Kết nối

- WebSocket: `ws://<host>/rooms/<MÃ_PHÒNG>`
- HTTP nộp code: `POST /api/rooms/<MÃ_PHÒNG>/submissions?filename=bot.py`
  - Header: `Authorization: Bearer <player_token>` (nhận từ thông điệp `joined`).
  - Body: nội dung file Python dạng `application/octet-stream`, tối đa 100 KB.
  - Thành công: `200 { "id": "...", "filename": "bot.py" }`.
  - Lỗi: mã khác 200 và JSON `{ "error": "...", "message": "..." }`.
- Mỗi phòng nhận tối đa hai đội chơi. Người chơi đầu tiên vào là `team_a`, người tiếp theo là `team_b`; người xem có thể vào bằng mã phòng.

## Giao diện → server (WebSocket)

| type | Dữ liệu | Khi nào |
|---|---|---|
| `join_room` | `code`, `team_name`, `role` (`"player"` hoặc `"spectator"`) | Ngay khi mở kết nối |
| `ready` | `ready: true/false` | Bấm Sẵn sàng / Hủy |

## Server → giao diện (WebSocket)

**`joined`**: `{ "type": "joined", "team_id": "team_a", "player_token": "..." }`. Với khán giả, hai giá trị này là `null`.

**`room_state`**: gửi mỗi khi phòng thay đổi.
```json
{
  "type": "room_state",
  "room": {
    "code": "K7QF",
    "status": "waiting",
    "teams": [
      { "id": "team_a", "name": "Doi A", "isMe": true,  "connected": true,  "submitted": true,  "ready": false, "filename": "bot.py" },
      { "id": "team_b", "name": "Doi B", "isMe": false, "connected": false, "submitted": false, "ready": false, "filename": null }
    ]
  }
}
```
`status`: `waiting` | `countdown` | `playing` | `finished`. `isMe` do server đặt cho từng kết nối (người xem thì không có đội nào `isMe`).

**`countdown`**: `{ "type": "countdown", "seconds": 3 }`, và `seconds: null` nếu hủy.

**`match_start`**: ba phần đầu của file replay.
```json
{ "type": "match_start", "match_info": { "match_id": "...", "teams": { "team_a": "Doi A", "team_b": "Doi B" } },
  "game_config": { ... }, "initial_state": [ ... ] }
```

**`turn`**: đúng một phần tử của `turns[]` trong file replay.
```json
{ "type": "turn", "turn": { "turn": 3, "player": "team_a", "actions": [ ... ], "events": [ ... ] } }
```

**`match_end`**: `{ "type": "match_end", "winner": "team_a", "reason": "BASE_CAPTURED" }` (`winner: null` nếu hòa).

**`error`**: `{ "type": "error", "message": "..." }`.

## Lưu ý

- Mọi `turn` / `match_start` dùng **cùng định dạng với file replay**, nên cùng một giao diện phát được cả trận trực tiếp lẫn replay cũ.
- Server kiểm tra đuôi file `.py`, UTF-8 và dung lượng; đội phải nộp bot trước khi sẵn sàng.
- Engine dùng cấu hình mặc định trong `engine/config.json`; đặt `PYTHON_EXECUTABLE` nếu máy không gọi được lệnh Python mặc định.
