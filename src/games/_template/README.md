# Game Template (client)

Điểm khởi đầu để thêm một game mới vào Platform. Game mẫu này là **Tap Counter**
— bấm nút càng nhiều càng tốt trong 20 giây.

## Cấu trúc

| File                | Vai trò                                               |
| ------------------- | ----------------------------------------------------- |
| `index.js`          | Plugin: manifest + cài đặt Contract (lifecycle hooks) |
| `logic.js`          | Business logic THUẦN (không React) — dễ unit test     |
| `GameComponent.jsx` | Render UI, chỉ gọi API của plugin                     |
| `styles.css`        | Style riêng của game                                  |

## Contract bắt buộc

Mỗi plugin phải cài đủ các phương thức sau (xem [`src/platform/core/contracts.js`](../../platform/core/contracts.js)):

- `init(context)` — nhận `context` từ Platform (`eventBus`, `playerId`, ...)
- `start()` — bắt đầu ván chơi
- `pause()` / `resume()`
- `destroy()` — dọn dẹp
- `getScore()` — trả về `{ playerId, score, playtimeMs, ... }` (phần thô;
  `GameSession` sẽ gắn `gameId` + `timestamp` và chuẩn hoá thành `ScorePayload`)
- `onGameOver(callback)` — đăng ký callback báo kết thúc (hoặc gọi
  `emitGameOver(...)` từ `BaseGamePlugin`)

Game `client` còn phải có `Component`; game `server` phải có `Viewer`.

## Thêm game mới

1. Sao chép thư mục `_template` thành `src/games/<game-id>/`.
2. Đổi `id`, `name`, `description` trong `manifest`.
3. Viết lại `logic.js` + `GameComponent.jsx` cho game của bạn.
4. Thêm manifest vào [`src/games/registry.js`](../registry.js).

Không cần sửa `src/platform/core` hay Shell UI.
