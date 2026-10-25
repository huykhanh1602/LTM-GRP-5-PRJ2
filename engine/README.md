# Game Engine - "Oẳn Tù Tì Trên Bàn Cờ"

> Game **Rắn Săn Mồi** (`snake_battle`) nằm ở [`snake/`](snake/README.md): hợp đồng bot, luật rụng đuôi, chướng ngại vật và mẫu bot.

Bộ engine Python chạy một trận đấu lượt đi giữa **hai bot** trên bàn cờ ma trận,
xử lý va chạm theo luật oẳn tù tì, cô lập timeout/crash của bot và xuất file
`replay.json` theo đúng định dạng mà giải đấu yêu cầu. Server Node gọi engine
này khi hai đội trong phòng đều đã nộp bot và sẵn sàng.

Engine vẫn có thể chạy **độc lập, offline** bằng `match_runner.py`; khi chạy qua
server, cờ `--stream` phát NDJSON gồm `match_start`, từng `turn`, và `match_end`.
Engine chỉ dùng thư viện chuẩn của Python.

## Cấu trúc thư mục

| File                                                     | Vai trò                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`config.json`](config.json)                             | Cấu hình bàn cờ mặc định, luật chơi, giới hạn thời gian/lượt.                                                   |
| [`game_engine.py`](game_engine.py)                       | Toàn bộ logic: `GameConfig`, `Piece`, `Board`, `CombatResolver`, `BotProcess`, `GameEngine`, `ReplayExporter`. |
| [`match_runner.py`](match_runner.py)                     | Script chính chạy trận và ghi `replay.json`.                                                                   |
| [`bot_sample_1.py`](bot_sample_1.py)                     | Bot mẫu đi ngẫu nhiên một nước hợp lệ.                                                                         |
| [`bot_sample_2.py`](bot_sample_2.py)                     | Bot mẫu tham lam tiến về Thành đối phương.                                                                     |
| [`tests/test_game_engine.py`](tests/test_game_engine.py) | Bộ kiểm thử (`unittest`).                                                                                      |

## Chạy trận đấu

```bash
python engine/match_runner.py
```

Hoặc chỉ định rõ bot / cấu hình / đầu ra:

```bash
python engine/match_runner.py \
  --bot-a engine/bot_sample_1.py \
  --bot-b engine/bot_sample_2.py \
  --config engine/config.json \
  --out engine/replay.json
```

> **Windows:** luôn chạy qua `match_runner.py` (đã có `if __name__ == "__main__"`).
> Bot chạy trong tiến trình `multiprocessing` (spawn) nên bắt buộc phải có guard này.

## Kiểm thử

```bash
npm test
```

Lệnh trên chạy kiểm thử server/phòng WebSocket. Có thể xác minh engine trực tiếp
bằng lệnh chạy trận mẫu phía trên. Server mặc định dùng `engine/config.json`. Đặt biến môi trường
`PYTHON_EXECUTABLE` nếu lệnh Python trên máy không phải `python` (Windows) hoặc
`python3` (macOS/Linux).

## Hợp đồng bot

Mỗi bot là một file Python chứa hàm:

```python
def make_move(board_state, my_pieces, opponent_pieces, config):
    ...
```

Tham số:

| Tên               | Kiểu         | Mô tả                                                                              |
| ----------------- | ------------ | ---------------------------------------------------------------------------------- |
| `board_state`     | `dict`       | `width`, `height`, `coordinate_system`, `special_tiles`, `turn`, `current_player`. |
| `my_pieces`       | `list[dict]` | Quân của đội mình (chỉ quân còn sống): `id`, `owner`, `type`, `pos`, `hp`.         |
| `opponent_pieces` | `list[dict]` | Quân đối phương (chỉ quân còn sống).                                               |
| `config`          | `dict`       | Nguyên văn nội dung `config.json`.                                                 |

Giá trị trả về — một dict nước đi:

```python
{ "piece_id": "A1", "action_type": "MOVE", "to": [x, y] }
```

hoặc `None` để bỏ lượt (bị tính là nước không hợp lệ).

## Hệ tọa độ

- `[x, y] = [cột, hàng]`.
- Gốc `(0, 0)` ở TOP-LEFT, `x` tăng sang phải, `y` tăng xuống dưới.
- Mã hệ tọa độ: `TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN`.

## Luật chơi

- **Di chuyển:** mỗi lượt chọn 1 quân và đi **đúng 1 ô theo 8 hướng** (kể cả chéo).
  Không ra ngoài bàn, không vào ô `OBSTACLE`, không đè lên quân mình.
  Có thể đi vào ô có quân địch để kích hoạt va chạm.
- **Va chạm (oẳn tù tì):** `ROCK` thắng `SCISSORS`, `SCISSORS` thắng `PAPER`,
  `PAPER` thắng `ROCK`. Quân thắng ở lại ô, quân thua bị hủy.
  Cùng loại: mặc định **cả hai cùng bị hủy** (cấu hình `same_type_collision`:
  `BOTH_DESTROYED` | `ATTACKER_DIES` | `DEFENDER_DIES`).
- **Bẫy (`TRAP`):** quân đứng lên bị hủy (`effect = DESTROYED`).
- **Thành (`BASE`):** đưa quân vào ô Thành của đối phương thắng ngay.

### Điều kiện kết thúc & `reason`

| Lý do (`win_reason` / `reason`) | Ý nghĩa                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `BASE_CAPTURED`                 | Đặt quân vào ô Thành đối phương.                        |
| `ALL_PIECES_CAPTURED`           | Bắt sạch quân đối phương.                               |
| `OPPONENT_TIMEOUT`              | Đối thủ vượt quá `max_timeouts`.                        |
| `OPPONENT_CRASH`                | Đối thủ vượt quá `max_errors` (lỗi/ nước không hợp lệ). |
| `MAX_TURNS_PIECE_COUNT`         | Hết `max_turns`, bên nhiều quân hơn thắng.              |
| `DRAW`                          | Hết `max_turns` mà số quân bằng nhau.                   |

## Cấu hình (`config.json`)

```jsonc
{
    "board": {
        "width": 8,
        "height": 8,
        "coordinate_system": "TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN",
        "special_tiles": [
            { "pos": [7, 0], "type": "BASE", "owner": "team_a" },
            { "pos": [0, 7], "type": "BASE", "owner": "team_b" },
            { "pos": [3, 3], "type": "OBSTACLE" },
            { "pos": [2, 2], "type": "TRAP" },
        ],
    },
    "rules": {
        "movement": "KING_8_DIR_1_STEP",
        "allow_diagonal": true,
        "same_type_collision": "BOTH_DESTROYED",
        "trap_effect": "DESTROYED",
        "combat": { "ROCK": "SCISSORS", "SCISSORS": "PAPER", "PAPER": "ROCK" },
    },
    "limits": {
        "max_turns": 100,
        "turn_mode": "ALTERNATING",
        "bot_time_ms": 1000,
        "max_timeouts": 3,
        "max_errors": 3,
        "starting_team": "team_a",
    },
    "initial_state": [{ "id": "A1", "owner": "team_a", "type": "ROCK", "pos": [0, 0], "hp": 1 }],
}
```

Quân `team_a` xuất phát ở cạnh trên nên cần tiến xuống căn cứ `team_b` ở cạnh dưới.
Quân `team_b` xuất phát ở cạnh dưới nên cần tiến lên căn cứ `team_a` ở cạnh trên.

Ghi chú: bot vượt `max_timeouts` lần timeout (hoặc `max_errors` lần lỗi/nước sai)
sẽ thua. Ngưỡng dùng so sánh `>`, tức với `max_timeouts = 3` thì lần timeout thứ 4
mới xử thua.

## Định dạng `replay.json`

```jsonc
{
    "match_info": {
        "match_id": "...",
        "teams": { "team_a": "...", "team_b": "..." },
        "winner": "team_a",
        "win_reason": "BASE_CAPTURED",
        "final_scores": { "team_a": 1, "team_b": 0 },
        "total_turns": 5,
    },
    "game_config": { "board": {}, "rules": {}, "limits": {} },
    "initial_state": [{ "id": "A1", "owner": "team_a", "type": "ROCK", "pos": [0, 0], "hp": 1 }],
    "turns": [
        {
            "turn": 1,
            "player": "team_a",
            "actions": [{ "piece_id": "A1", "action_type": "MOVE", "from": [0, 0], "to": [1, 1] }],
            "events": [{ "type": "PIECE_MOVED", "piece_id": "A1", "from": [0, 0], "to": [1, 1] }],
        },
    ],
}
```

### Các loại `event`

| `type`            | Trường                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `PIECE_MOVED`     | `piece_id`, `from`, `to`                                                                    |
| `COMBAT_RESOLVED` | `attacker_id`, `defender_id`, `location`, `winner_id`, `destroyed_pieces`, `damaged_pieces` |
| `TRAP_TRIGGERED`  | `piece_id`, `location`, `effect`                                                            |
| `BASE_CAPTURED`   | `team_id`, `location`                                                                       |
| `BOT_TIMEOUT`     | `team_id`, `max_time_ms`                                                                    |
| `BOT_ERROR`       | `team_id`, `error_message`                                                                  |
| `GAME_OVER`       | `winner_team`, `reason` (bắt buộc ở lượt cuối)                                              |

Nước đi không hợp lệ và lỗi của bot đều ghi nhận dưới dạng `BOT_ERROR`
(`error_message` bắt đầu bằng `INVALID_MOVE:` khi sai luật).
