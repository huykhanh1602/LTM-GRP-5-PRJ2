# Báo cáo luồng hoạt động project

> Tài liệu nhập môn và ôn vấn đáp. Nội dung dựa trên mã nguồn hiện tại; ưu tiên luồng chơi trận thật qua WebSocket v2.

## 1. Project này làm gì?

Đây là nền tảng đấu game giữa bot/người chơi. Frontend React hiển thị trang game, phòng chờ, bàn đấu trực tiếp, replay, xếp hạng và giải đấu. Backend Node.js quản lý đăng nhập, phòng, ghép trận, giao tiếp WebSocket, lưu lịch sử và điểm. Engine Python thực thi luật game và quyết định kết quả trận.

Các game đang bật trong luồng server gồm:

- `rps_chess`: Kéo · Búa · Bao Cờ trên bàn cờ.
- `snake_battle`: Rắn Săn Mồi.

Frontend có danh mục nhiều game, nhưng một số mục chỉ là giới thiệu/chưa bật. Danh sách và trạng thái nằm ở [`src/games/catalog.js`](../src/games/catalog.js); server xác định game thực sự chạy trong [`net/wsGateway.js`](../net/wsGateway.js).

## 2. Sơ đồ tổng quan

```text
Trình duyệt (React)
  App → GameLobby → Room → Match
          │           │       │
          └──── useRoom + src/api/socket.js ─────┐
                                                 │ HTTP + WebSocket /ws
Backend Node.js                                  ▼
  net/index.js → net/http.js + net/wsGateway.js
                         │            │
                         │            ├─ xác thực / phòng / hàng đợi / trạng thái trận
                         │            ├─ net/engineRunner.js
                         │            │       └─ chạy tiến trình Python
                         │            └─ lưu replay / rating
                         └─ API tài khoản, lịch sử, giải đấu
                                      │
Python engine                            SQLite mặc định hoặc PostgreSQL
  engine/game_engine.py
  engine/snake/snake_engine.py
```

## 3. Luồng một trận đấu thật

1. **Chọn game và chế độ**  
   Trang chủ được render bởi `HomePage`; chọn game sẽ đổi URL hash và đưa vào `GameLobby`. Việc chọn trang/điều hướng nằm trong [`src/App.jsx`](../src/App.jsx), còn cách hiển thị lobby nằm trong [`src/pages/GameLobby.jsx`](../src/pages/GameLobby.jsx). Chế độ gồm casual, ranked và tournament; tính năng có thể bật/tắt theo từng game trong catalog.

2. **Mở kết nối và xác thực**  
   `useRoom` quản lý trạng thái của phòng/trận. Nó gọi `connect()` trong [`src/api/index.js`](../src/api/index.js), sau đó [`src/api/socket.js`](../src/api/socket.js) lấy token guest qua `POST /api/auth/guest` nếu chưa có token, mở WebSocket `/ws`, rồi gửi `auth`. Người đã đăng nhập dùng token tài khoản.

3. **Tạo phòng, vào phòng hoặc tìm đối thủ**  
   Sau khi server xác nhận đăng nhập, client gửi một trong các tin `create_room`, `join_room`, `find_match`, `watch_room` hoặc `join_tournament_room`. Backend xử lý ở [`net/wsGateway.js`](../net/wsGateway.js), giữ trạng thái phòng/người chơi và phát `room_state`. Client chuyển dữ liệu protocol v2 về mô hình mà UI dùng trong `toUiRoom()`/`toUiMessage()` ở [`src/api/socket.js`](../src/api/socket.js).

4. **Chuẩn bị trước trận**  
   Ở trang `Room`, người chơi có thể chọn điều khiển bằng bot hoặc bằng chuột nếu chế độ phòng cho phép. Chơi bằng bot thì nộp code/file Python; server kiểm tra nội dung rồi lưu vào slot người chơi. Hai người chơi cần sẵn sàng; server đếm ngược rồi bắt đầu trận. Giao diện tương ứng nằm trong [`src/pages/Room.jsx`](../src/pages/Room.jsx), protocol được mô tả ở [`docs/WS_PROTOCOL_V2.md`](./WS_PROTOCOL_V2.md).

5. **Backend khởi chạy engine**  
   `wsGateway` gọi [`net/engineRunner.js`](../net/engineRunner.js). Runner chọn engine theo `gameId`, tạo thư mục tạm, ghi bot/config, rồi chạy Python với `--stream`. Đầu ra dạng NDJSON từ engine được đọc từng dòng. Engine chính của Kéo · Búa · Bao Cờ là [`engine/game_engine.py`](../engine/game_engine.py); Snake là [`engine/snake/snake_engine.py`](../engine/snake/snake_engine.py).

6. **Luật game tạo sự kiện theo từng lượt**  
   Engine phát `match_start`, `turn`, `match_end`. Với lượt người chơi điều khiển bằng chuột, backend gửi yêu cầu lượt đi tới client; nước đi được gửi lại cho engine. Engine mới là nơi kiểm tra nước đi và áp dụng luật, nên client không tự quyết định thắng/thua.

7. **Cập nhật bàn đấu trực tiếp**  
   `socket.js` chuyển các sự kiện server thành dạng UI; [`src/hooks/useRoom.js`](../src/hooks/useRoom.js) cập nhật trạng thái trận, frame và replay. [`src/pages/Match.jsx`](../src/pages/Match.jsx) kết hợp `Board`, `Controls`, `TurnList` và playback để hiển thị bàn đấu, lượt chơi, thao tác chuột và kết quả.

8. **Kết thúc và lưu dữ liệu**  
   Server chốt kết quả, phát `game_over`, lưu replay/lịch sử; ranked thì tính và ghi thay đổi Elo. Frontend cập nhật banner kết quả và giữ replay cho màn hình replay/lịch sử. Storage được chọn ở [`net/storage/index.js`](../net/storage/index.js): có `DATABASE_URL` thì PostgreSQL, không có thì SQLite (mặc định `data/game.sqlite`). Rating có repository SQLite/PostgreSQL riêng.

## 4. Các nhánh chức năng khác

- **HTTP API:** server HTTP được tạo ở [`net/http.js`](../net/http.js), đăng ký và ghép với các gateway tại [`net/index.js`](../net/index.js). Các màn profile, lịch sử, bảng xếp hạng và thông tin giải lấy dữ liệu qua API.
- **Giải đấu:** luồng nghiệp vụ nằm ở [`net/application/tournament/TournamentService.js`](../net/application/tournament/TournamentService.js), luật bracket ở `net/domain/tournament/` và định dạng ở `net/application/tournament/formats/`. Lưu ý quan trọng khi thuyết trình: trong `net/index.js`, TournamentService chỉ được khởi tạo khi có `DATABASE_URL`; `matchQueue.enqueue()` hiện chỉ ghi log và có chú thích chờ tích hợp hàng đợi thực thi trận. Vì vậy không nên mô tả phần tự động đưa trận giải vào engine như đã hoàn thiện.
- **Gateway đời cũ / giao thức khác:** còn thấy `botGateway`, `spectatorGateway`, `roomGateway` và `orchestrator` trong backend. Nhưng UI hiện tại kết nối luồng phòng/trận qua `/ws` v2; đừng nhầm các endpoint/gateway này với luồng chính khi giải thích cách frontend chơi trận.
- **Platform core thử nghiệm:** `src/platform/core/` và `src/games/_template/` là nền tảng/plugin mẫu riêng; `src/games/registry.js` hiện đăng ký template chứ không phải đường chạy trận bot chính. Nếu thầy hỏi luồng trận hiện tại, bắt đầu từ `App → useRoom → socket → wsGateway → engineRunner → Python engine`, không bắt đầu ở Platform core.

## 5. Đọc code từ đâu để ôn nhanh?

Đọc theo thứ tự dưới đây, đừng cố đọc toàn bộ project:

1. [`package.json`](../package.json) — biết lệnh chạy, build, test và runtime Node yêu cầu.
2. [`src/App.jsx`](../src/App.jsx) — biết các màn hình và điều hướng của frontend.
3. [`src/hooks/useRoom.js`](../src/hooks/useRoom.js) — hiểu state machine UI: `idle → connecting/queue → room → match`, nhận tin và phát action.
4. [`src/api/socket.js`](../src/api/socket.js) và [`docs/WS_PROTOCOL_V2.md`](./WS_PROTOCOL_V2.md) — hiểu JSON client/server gửi nhận.
5. [`net/index.js`](../net/index.js) — nơi khởi tạo storage, services, gateway và route WebSocket.
6. [`net/wsGateway.js`](../net/wsGateway.js) — đọc phần xử lý auth, tạo/tham gia phòng, ready, bắt đầu trận, kết quả.
7. [`net/engineRunner.js`](../net/engineRunner.js) — cầu nối Node ↔ tiến trình Python, bot và lượt người thật.
8. Chọn **một** engine để nắm luật: [`engine/game_engine.py`](../engine/game_engine.py) (Kéo · Búa · Bao Cờ) hoặc [`engine/snake/snake_engine.py`](../engine/snake/snake_engine.py) (Snake). Xem thêm [`engine/README.md`](../engine/README.md) và [`engine/snake/README.md`](../engine/snake/README.md).
9. Nếu thầy hỏi dữ liệu: [`net/storage/index.js`](../net/storage/index.js), [`net/storage/matchStore.js`](../net/storage/matchStore.js), schema SQLite ở [`net/storage/schema.sql`](../net/storage/schema.sql), và [`net/application/rating/RatingService.js`](../net/application/rating/RatingService.js).

**Nếu chỉ còn 30 phút:** đọc mục 2 và 3 của báo cáo này, sau đó đọc các bước 2–8 trong danh sách. Ưu tiên hiểu luồng một trận trước; chỉ đào sâu giải đấu hoặc Platform core nếu đề tài nhóm của bạn tập trung vào các phần đó.

## 6. Cách chạy và tự kiểm tra

- Node.js yêu cầu phiên bản `>=24` theo `package.json`.
- Tạo/cấu hình `.env` theo `.env.example`; Python executable có thể cấu hình bằng `PYTHON_EXECUTABLE`.
- `npm run dev:all`: chạy backend và frontend cùng lúc; script chọn cổng trống và chờ health check.
- `npm run server`: chỉ chạy backend.
- `npm run dev`: chỉ chạy Vite frontend.
- `npm test`: chạy test Node; test luật Python nằm trong `engine/tests/` và `engine/snake/tests/`.
- `npm run build`: build frontend.

## 7. Câu hỏi thầy có thể hỏi — trả lời ngắn

**Frontend và backend trao đổi thế nào?**  
HTTP dùng cho API như đăng nhập và dữ liệu; WebSocket `/ws` dùng cho trạng thái phòng, ghép trận và sự kiện trực tiếp. Tin WebSocket là JSON, server là bên quyết định trạng thái hợp lệ.

**File nào chịu trách nhiệm chạy luật game?**  
Backend gọi `engineRunner.js`, file này khởi chạy Python engine theo game ID. Luật nằm trong engine Python tương ứng, không nằm trong component React.

**Bot gửi nước đi ra sao?**  
Bot phải theo giao diện của game và trả action hợp lệ. Engine chạy bot trong tiến trình riêng, áp giới hạn thời gian/lỗi, kiểm tra action rồi mới cập nhật trạng thái và phát sự kiện lượt.

**Replay được tạo ở đâu?**  
Engine phát dữ liệu trận/lượt; server chuyển tiếp và lưu. Frontend ghép các lượt thành replay/frame bằng các helper replay để vừa xem trực tiếp vừa xem lại.

**Có thể chơi bằng người thật không?**  
Có, nếu phòng cho phép chế độ human. Engine yêu cầu action theo lượt; client hiển thị bàn để người chơi gửi nước đi, còn engine vẫn kiểm tra action.

**Nếu backend không có PostgreSQL thì sao?**  
Match store và rating dùng SQLite theo cấu hình mặc định. Phần khởi tạo TournamentService trong `net/index.js` hiện chỉ chạy khi có `DATABASE_URL`.

**Nói gọn luồng chính trong một câu:**  
“React kết nối backend qua WebSocket; backend quản lý phòng và khởi chạy engine Python; engine xử lý luật từng lượt, backend phát sự kiện và lưu kết quả, frontend dựng bàn đấu và replay.”
