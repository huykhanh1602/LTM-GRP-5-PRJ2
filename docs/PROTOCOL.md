# Giao thức giao diện ↔ server 

Giao diện chỉ là **người xem + người điều khiển phòng**. Code của 2 đội chạy trên **server**; engine là trọng tài.

## Kết nối

- WebSocket: `ws://<host>/rooms/<MÃ_PHÒNG>`
- HTTP nộp code: `POST /api/rooms/<MÃ_PHÒNG>/submissions` (`multipart/form-data`: `team_name`, `file`)
  - Thành công: `200 { "id": "...", "filename": "bot.py" }`
  - Lỗi: mã khác 200, nội dung là câu báo lỗi (ví dụ "File quá lớn")

## Giao diện → server (WebSocket)

| type | Dữ liệu | Khi nào |
|---|---|---|
| `join_room` | `code`, `team_name`, `role` (`"player"` hoặc `"spectator"`) | Ngay khi mở kết nối |
| `ready` | `ready: true/false` | Bấm Sẵn sàng / Hủy |

## Server → giao diện (WebSocket)

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
- Server nên kiểm tra lại đuôi file và dung lượng (giao diện chỉ kiểm tra để báo lỗi sớm).
- Các giá trị còn chờ chốt: đuôi file code (`src/config.js`), có cần mã đội hay đăng nhập không, người xem có vào phòng được không.
