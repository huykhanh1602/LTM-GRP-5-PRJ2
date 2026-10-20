# Lưu trữ trận đấu và bảng xếp hạng

## Quyết định hiện tại

Backend dùng PostgreSQL khi đặt `DATABASE_URL`; đây là cấu hình triển khai theo
thiết kế nền tảng. Nếu không đặt biến này, môi trường local tiếp tục dùng SQLite
ở `data/game.sqlite` (hoặc đường dẫn trong `DB_PATH`) để chạy mà không cần cài
dịch vụ database. PostgreSQL schema tự áp dụng khi backend khởi động.

Để đưa database SQLite hiện tại sang PostgreSQL, đặt `DATABASE_URL` trỏ tới
database đích rồi chạy `pnpm run migrate:sqlite-to-postgres`. Lệnh sao chép dữ
liệu theo transaction, giữ nguyên file SQLite nguồn và có thể chạy lại an toàn.
Sau đó khởi động backend với cùng `DATABASE_URL`; chỉ bỏ SQLite sau khi đã xác
nhận dữ liệu trên PostgreSQL. Cấu hình mẫu nằm trong `.env.example`.

Node.js >= 24 là bắt buộc. Bản deploy dùng `pnpm-lock.yaml`; Docker cài đúng
phiên bản lock.

Đây là phương án triển khai dựa trên repository hiện tại, chưa phải quyết định
đã được xác nhận qua chat nhóm. Quy tắc mặc định: thắng 3, hòa 1, thua 0.
Chỉ trận `finished` và `ranked = true` được tính điểm. Trận luyện tập dùng
`ranked: false`. Thiếu kết quả hoặc dừng trận được lưu là `aborted`, không coi là hòa.
Xếp theo điểm, số trận thắng, tỷ lệ thắng; bằng cả ba tiêu chí thì đồng hạng.
ID đội chỉ dùng để sắp xếp ổn định khi đồng hạng. Đội chưa thi đấu vẫn xuất hiện với 0 điểm.

## Database

Schema SQLite: `net/storage/schema.sql`. Schema PostgreSQL:
`net/storage/postgres-schema.sql`.

| Bảng        | Nội dung                                                                  | Khóa / quan hệ                                     |
| ----------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| teams       | ID ổn định, tên đội, thời gian tạo                                        | PK id                                              |
| matches     | Phòng, hai đội, trạng thái, kết quả, thời gian, cấu hình, bàn cờ đầu/cuối | PK id; FK team_a_id, team_b_id, winner_id -> teams |
| match_turns | Số lượt, đội chơi, hành động, sự kiện, trạng thái sau lượt                | PK (match_id, turn); FK match_id -> matches        |
| users, auth_identities | Hồ sơ và ID từ nhà cung cấp đăng nhập | FK identity -> users; unique provider ID |
| games | Danh mục game và cấu hình mặc định | PK id |
| tournaments, tournament_rounds, tournament_entries | Giải đấu, vòng và người tham gia | FK tới games, users, tournaments |
| bot_submissions | Từng phiên bản mã bot, SHA-256 và thời điểm nộp | FK team_id -> teams |

Trường bàn cờ/cấu hình/hành động/sự kiện lưu JSON để không chốt luật chơi khi nhóm
chưa triển khai game engine. Mốc thời gian là ISO 8601 UTC.
Bot ID thay đổi theo kết nối, nên không dùng bot ID để xếp hạng đội.
Registry có thể bổ sung `teamId`, `teamName`; hiện fallback về `team` (A/B).
Khi mở nhiều phòng, bắt buộc cấp teamId riêng cho từng đội thực, vì A/B chỉ là vị trí trong trận.

Không lưu bộ đếm điểm riêng: bảng xếp hạng truy vấn kết quả chính thức từ matches.
Nhờ vậy không lệch điểm khi callback kết thúc bị gọi lại. Ghi lượt và hoàn tất
trận đều chạy trong transaction. Nước đi trùng hoặc cũ bị từ chối.
Khi server khởi động lại, trận còn `playing` được đánh dấu `aborted` với lý do
`SERVER_RESTART`; hiện chưa có khôi phục trận. Thiết kế dành cho một tiến trình game server.

## API cho UI

Chạy `npm run server`, sau đó `npm run dev`. Vite chuyển tiếp `/api` sang cổng 3000.

| Method | Đường dẫn                                               | Kết quả                                                          |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------- |
| GET    | /api/rankings                                           | `{ items, scoring: { win: 3, draw: 1, loss: 0 } }`               |
| GET    | /api/matches?teamId=A&status=finished&limit=20&offset=0 | `{ items, total, limit, offset }`                                |
| GET    | /api/matches/:id                                        | Chi tiết trận, cấu hình, bàn cờ đầu/cuối, kết quả                |
| GET    | /api/matches/:id/replay                                 | `{ match_info, game_config, initial_state, turns, final_state }` |
| GET    | /api/me                                                  | `{ authenticated, user }`; user null nếu guest |
| GET    | /api/games                                               | `{ items }` danh mục game đang hoạt động |
| GET    | /api/tournaments?status=open&limit=20&offset=0            | `{ items, total, limit, offset }` |
| GET    | /api/tournaments/:id-or-code                             | Chi tiết giải, vòng và người tham gia |
| POST   | /api/tournaments                                         | Tạo giải; yêu cầu role organizer/admin |
| POST   | /api/tournaments/:id/entries                             | Tài khoản đã đăng nhập tự tham gia |
| POST   | /api/tournaments/:id/rounds                              | Tạo vòng; organizer/admin |
| PATCH  | /api/tournaments/:id/status                              | Đổi trạng thái theo luồng hợp lệ; organizer/admin |
| POST   | /api/rooms/:code/submissions?filename=bot.py             | Lưu phiên bản bot; yêu cầu bearer token của đội |
| GET    | /api/rooms/:code/submissions?limit=20&offset=0           | Lịch sử metadata; token phải còn hiệu lực |
| GET    | /api/rooms/:code/submissions/:id                          | Đọc mã nguồn; chỉ đúng đội mới có quyền |

Các bộ lọc không bắt buộc. Status: `playing`, `finished`, `aborted`.
Limit từ 1 đến 100, mặc định 20; offset là số nguyên không âm, mặc định 0.
Lịch sử sắp theo thời gian bắt đầu mới nhất. `win_rate` là tỷ lệ 0..1.
Replay dùng team_a/team_b cho owner, player và winner giống engine Python và renderer;
`team_ids` ánh xạ hai vị trí tới ID đội thực. API chi tiết và bảng xếp hạng vẫn dùng ID đội thực.
API lỗi trả `{ error, message }`. Route ghi tournament yêu cầu middleware xác
thực cấp role; lịch sử submission ràng buộc theo player token và không trả mã
nguồn trong danh sách. Kết quả trận và xếp hạng chỉ ghi từ backend/engine.

`createHttpServer` nhận hàm `authenticate(request)` trả
`{ user: { id, role, ... } }`. Repository chưa tích hợp OAuth; tới khi phần xác
thực của Vinh nối middleware này, `/api/me` trả guest và thao tác tournament cần
đăng nhập sẽ trả 401. Không dùng header tự khai báo role để mở quyền ghi.

Hàm gọi đã có trong `src/api.js`:

```js
import { getRankings, getMatches, getMatch, getMatchReplay } from "./api.js";

const { items: rankings } = await getRankings();
const history = await getMatches({ teamId: "A", status: "finished", limit: 10 });
const match = await getMatch(history.items[0].id);
const replay = await getMatchReplay(match.id);
```

UI cần kiểm tra lịch sử rỗng và xử lý exception bằng thông báo lỗi. Không ghi kết quả
từ trình duyệt. WebSocket `game_state`/`game_over` có `matchId` để UI lấy replay.
Đã có hai tab **Lịch sử trận đấu** và **Bảng xếp hạng** gọi API thật, độc lập với
chế độ server giả của phòng đấu. Lịch sử có lọc đội/trạng thái, phân trang,
chi tiết trận và nút mở replay bằng trình xem bàn cờ hiện có. Có trạng thái tải,
database rỗng và lỗi backend cùng nút Tải lại. Chạy lại backend sau khi cập nhật
mã và refresh trình duyệt để dùng phiên bản mới.

Khi deploy, có hai cách: reverse proxy `/api` đến game server cùng origin với UI, hoặc
đặt `VITE_API_URL` trỏ thẳng tới origin backend (ví dụ Railway). Backend đã bật CORS
(headers dùng chung trong `net/cors.js`) nên gọi cross-origin từ Vercel hoạt động bình thường.
Nếu đổi PORT backend, sửa đích proxy trong vite.config.js tương ứng.

## Hàm phía server và điểm tích hợp game engine

Store cung cấp `registerTeam`, `startMatch`, `appendTurn`, `finishMatch`,
`getMatch`, `listMatches`, `getReplay`, `getRankings`, `importReplay`, `abortInterruptedMatches`, `close`.

Đã tích hợp vào ba hàm orchestrator hiện có:

```js
await orchestrator.startRoom("room-01", initialState, {
    config: { board: { width: 8, height: 8 }, max_turns: 100 },
    ranked: true,
});

// Chỉ gọi sau khi game engine xác nhận nước đi hợp lệ và áp dụng thành công.
await orchestrator.updateRoomState("room-01", nextState, "B", {
    turn: 1,
    player: "A", // ID đội ổn định, không phải botId
    actions: [{ piece_id: "A1", action_type: "MOVE", from: [0, 0], to: [1, 0] }],
    events: [{ type: "PIECE_MOVED", piece_id: "A1", from: [0, 0], to: [1, 0] }],
});

await orchestrator.stopRoom("room-01", { winner: "A", reason: "BASE_CAPTURED" });
// Hòa: { draw: true, reason: 'MAX_TURNS' }
// Hủy/dừng: null hoặc { reason: 'CANCELLED' }
```

`winner` hoặc `winner_team` phải là ID đội tham gia trận. Không dùng tên hiển thị.
Không được vừa khai báo winner vừa `draw: true`.
Nếu `updateRoomState` không có đối số thứ tư thì không lưu một lượt replay.
State cuối vẫn được lưu khi kết thúc. Bộ game engine cần truyền đầy đủ turnRecord
để replay có tất cả nước đi; phần MOVE trong botGateway hiện chưa được triển khai.

Khi hai bot đăng ký, luồng tự bắt đầu hiện tại vẫn tạo trận với bàn cờ null.
Không tự nhập replay.json vào database và không tạo kết quả/điểm giả.
Người phụ trách game engine cần nối khởi tạo bàn cờ và các callback trên.

## Nhập kết quả engine Python

Đối với engine offline, sau khi tạo replay của trận chính thức, chạy:

```powershell
node net/importReplay.js engine/replay.json
```

Lệnh này ghi đội, thông tin trận, lượt đi, bàn cờ cuối và kết quả trong một
transaction. Sau đó bấm Tải lại ở tab lịch sử/xếp hạng để xem. Nhập lại cùng
match_id bị từ chối, không cộng điểm trùng. Lượt không hợp lệ khiến toàn bộ import
rollback. Kết quả GAME_OVER phải khớp match_info. Trận hòa phải có winner null,
win_reason DRAW. Lệnh không sửa replay đầu vào.

Để nhập một trận luyện tập mà không ảnh hưởng điểm:

```powershell
node net/importReplay.js engine/replay.json --unranked
```

Không mở API công khai cho browser tự ghi kết quả. Hàm server `importReplay`
có thể được gọi trực tiếp bởi bộ điều phối engine. `teamAId`/`teamBId` là tùy chọn
để chỉ định ID đội ổn định; nếu không có, dùng team_ids trong replay, rồi fallback
tên đội. Bộ engine phải giữ tên hoặc ID đội ổn định giữa các trận.
Luồng phòng đấu mô phỏng không tự ghi vào database. Luồng phòng đấu thật qua
roomGateway đã nhận matchStore từ net/index.js: khi runEngineMatch trả replay,
backend tự nhập kết quả và lượt đi, giữ thời gian bắt đầu/kết thúc trận.

## Danh sách replay và ví dụ

Tab Xem replay tải danh sách trận hoàn tất bằng một API phân trang, hiển thị
hai đội, ngày giờ bắt đầu, kết quả thắng/hòa và loại trận. Có bộ lọc chọn đội.
Chỉ khi bấm vào trận mới tải dữ liệu replay đầy đủ; nút Danh sách trận quay về
danh sách. API list trả thêm team_a_name và team_b_name để không phải tải toàn
bộ replay của từng trận chỉ để lấy tên đội.

Chạy `node scripts/seed-replay-examples.mjs` để lưu ba trận ví dụ có nhãn
[Ví dụ]: Hoàng Định thắng Huy Khánh, Hoàng Định thua LTM 5, Hoàng Định hòa
Huy Khánh. Đây là dữ liệu minh họa, ranked=false, không tính điểm. Chạy lại
không thêm trùng hoặc sửa bản đã lưu. Script dùng DB_PATH nếu được cấu hình.

`scripts/check-saved-replays.mjs` kiểm thử trên Chrome với database hiện tại
sau khi seed: danh sách, tên đội, thời gian, kết quả, mở cả ba replay và tải
lại trang. Dùng PLAYWRIGHT_MODULE như script kiểm thử UI ở dưới.

## Kiểm thử

`npm test` hoặc `node --test` kiểm tra: thắng/hòa, tính điểm một lần,
bỏ qua luyện tập/hủy trận, persistence khi mở lại database, transaction rollback,
thứ tự lượt, tích hợp orchestrator và HTTP API (phân trang, lỗi, từ chối ghi).

Đã có thêm kiểm thử import Python replay -> database -> parseReplay/buildFrames
của frontend, chuẩn hóa ID đội, hòa và bàn cờ cuối. Kiểm thử trình duyệt tùy chọn:
`node scripts/check-database-ui.mjs` (cần package Playwright và Chrome; có thể
đặt PLAYWRIGHT_MODULE thành URL file của module Playwright đã cài).
Script dùng database/port tạm, xác nhận bảng xếp hạng, lọc, phân trang, chi tiết,
replay, màn hình mobile và lỗi khi backend dừng; không ghi dữ liệu giả vào
data/game.sqlite. Ảnh kiểm chứng lưu trong data/verification.
