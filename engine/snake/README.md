# Rắn Săn Mồi (`snake_battle`) — hướng dẫn viết bot

Hai bot Python điều khiển hai con rắn trên cùng một bàn cờ. Ăn mồi để lấy điểm, tránh va chạm.
Hết lượt thì bên nhiều điểm hơn thắng; ai đâm vào vật cản thì thua ngay.

## Nộp bot

- Một file `.py` (UTF-8, tối đa 100 KB), tên chỉ gồm chữ, số, `_`, `-` (tối đa 50 ký tự).
- File phải có hàm cấp module `make_move` với đúng 4 tham số dưới đây. Server kiểm tra cú pháp và sự có mặt
  của hàm này ngay khi nộp.
- Mỗi lượt của đội mình, engine gọi `make_move` một lần. Quá `bot_time_ms` (mặc định 1000 ms) hoặc lỗi
  (exception) thì **thua ngay**.
- Bot chạy trong tiến trình riêng (`multiprocessing`, spawn). Nếu có code chạy ở cấp module (ngoài hàm), hãy đặt
  nó sau `if __name__ == "__main__":`. Mọi `print` bị chuyển sang stderr.

```python
def make_move(board_state, my_pieces, opponent_pieces, config):
    return {"action_type": "MOVE", "direction": "UP"}   # UP | DOWN | LEFT | RIGHT
```

## Dữ liệu bot nhận mỗi lượt

| Tham số           | Nội dung                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- |
| `board_state`     | Trạng thái bàn cờ (bảng bên dưới).                                                    |
| `my_pieces`       | Các đốt rắn của mình, **phần tử 0 là đầu**: `{"id": "SEG_0", "type": "HEAD", "pos": [x, y]}`; thân là `"BODY"`. |
| `opponent_pieces` | Các đốt rắn đối phương, cùng dạng, `id` là `OPP_0`, `OPP_1`...                        |
| `config`          | Nguyên văn `engine/snake/config.json` (kích thước bàn, `limits`, `rules`).            |

`board_state`:

| Khóa             | Ý nghĩa                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `width`, `height`| Kích thước bàn (mặc định 16 × 16).                                                         |
| `turn`           | Số thứ tự lượt chung (tính cả hai bên), bắt đầu từ 1.                                      |
| `current_player` | `"team_a"` hoặc `"team_b"`: đội đang tới lượt (chính là bạn).                              |
| `foods`          | Danh sách `[x, y]` các ô có mồi.                                                           |
| `obstacles`      | Danh sách `[x, y]` các ô có **đuôi đã rụng** (xem luật bên dưới). Rỗng khi chưa có.         |
| `score`          | Điểm của bạn.                                                                              |
| `opponent_score` | Điểm của đối phương.                                                                       |

**Hệ tọa độ:** `[x, y] = [cột, hàng]`, gốc `(0, 0)` ở góc **trên-trái**, `x` tăng sang phải, `y` tăng xuống dưới.
Vì vậy `UP` là `y - 1`, `DOWN` là `y + 1`, `LEFT` là `x - 1`, `RIGHT` là `x + 1`.

## Giá trị trả về

Hợp lệ: `{"action_type": "MOVE", "direction": "UP"}` (cũng chấp nhận chuỗi `"UP"` hoặc dict có `"direction"`).
Hướng khác bốn hướng trên, hoặc không trả về dict/chuỗi, là **nước đi sai luật và thua ngay**. Rắn luôn đi đúng
một ô theo hướng chọn; không thể đứng yên.

## Luật chơi

- Hai bên đi **xen kẽ** (A trước, B sau), mỗi lượt đi một ô. Mỗi con rắn bắt đầu dài 3 đốt.
- **Ăn mồi:** đầu bước vào ô có mồi thì +10 điểm, rắn dài thêm 1 đốt và một mồi mới xuất hiện ở ô trống ngẫu nhiên.
- **Đuôi rụng:** cứ sau mỗi **5 nước đi của chính con rắn đó**, nếu nó **dài hơn 4 đốt** thì **2 đốt cuối rụng ra**
  và trở thành chướng ngại vật cố định đến hết trận. Rắn dài từ 4 đốt trở xuống thì không rụng. Các số này nằm
  trong `config["rules"]["tail_shed"]` (`every`, `min_length`, `count`).
- **Thua ngay** (bên còn lại thắng, bất kể điểm) khi:

| `reason`             | Khi nào                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `SNAKE_HIT_WALL`     | Đầu bước ra ngoài bàn.                                                                       |
| `SNAKE_HIT_OBSTACLE` | Đầu bước vào ô đuôi đã rụng (kể cả đuôi của chính mình).                                     |
| `SNAKE_HIT_BODY`     | Đầu bước vào thân mình hoặc **bất kỳ đốt nào của đối phương**. Riêng ô đuôi của chính mình thì được phép vì đuôi sẽ dịch đi. |
| `BOT_...`            | Bot lỗi, quá giờ hoặc không nạp được.                                                        |
| `ILLEGAL_MOVE`       | Trả về hướng không hợp lệ.                                                                   |

- **Hết lượt:** đủ `limits.max_turns` (mặc định 200 lượt chung, tức khoảng 100 nước mỗi bên) mà chưa ai thua thì
  bên điểm cao hơn thắng (`SCORE_LEAD`), bằng điểm thì hòa (`DRAW`).

## Mẫu bot (tránh tường, thân và đuôi đã rụng, đi tới mồi gần nhất)

```python
DIRECTIONS = {"UP": (0, -1), "DOWN": (0, 1), "LEFT": (-1, 0), "RIGHT": (1, 0)}


def make_move(board_state, my_pieces, opponent_pieces, config):
    width, height = board_state["width"], board_state["height"]
    head_x, head_y = my_pieces[0]["pos"]

    # Ô chết: thân mình (trừ ô đuôi vì đuôi sẽ dịch đi), toàn bộ rắn đối phương và đuôi đã rụng.
    blocked = {tuple(p["pos"]) for p in my_pieces[:-1]}
    blocked |= {tuple(p["pos"]) for p in opponent_pieces}
    blocked |= {tuple(pos) for pos in board_state.get("obstacles", [])}

    foods = [tuple(f) for f in board_state.get("foods", [])]

    best, best_score = "UP", None
    for name, (dx, dy) in DIRECTIONS.items():
        x, y = head_x + dx, head_y + dy
        if not (0 <= x < width and 0 <= y < height) or (x, y) in blocked:
            continue
        distance = min((abs(x - fx) + abs(y - fy) for fx, fy in foods), default=0)
        if best_score is None or distance < best_score:
            best, best_score = name, distance
    return {"action_type": "MOVE", "direction": best}
```

Gợi ý nâng cấp: đừng chỉ nhìn một ô phía trước; hãy kiểm tra ô đó còn bao nhiêu ô trống xung quanh để khỏi tự
nhốt mình, và nhớ rằng bàn cờ càng về cuối càng nhiều vật cản do đuôi rụng.

## Thử bot trên máy

Từ thư mục gốc của dự án:

```bash
python engine/snake/match_runner.py \
  --bot-a engine/snake/bot_sample_greedy.py --bot-b ./bot_cua_ban.py \
  --config engine/snake/config.json --out replay.json
```

Lệnh in từng sự kiện ra màn hình và ghi `replay.json` (kết quả nằm ở `match_info.winner` và `win_reason`).
Windows dùng `python`, macOS/Linux có thể là `python3`. Thêm `"seed": 123` vào config để mồi sinh ra giống nhau mỗi lần.

## Các sự kiện trong replay

Mỗi lượt có `events` và luôn kết thúc bằng `SNAKE_STATE` (ảnh chụp toàn bộ rắn, mồi, chướng ngại vật và điểm số).

| Sự kiện       | Ý nghĩa                                                           |
| ------------- | ----------------------------------------------------------------- |
| `FOOD_EATEN`  | Một bên ăn mồi (`pos`, `score`).                                  |
| `TAIL_SHED`   | Một bên rụng đuôi (`cells`: các ô thành chướng ngại vật, `remaining_length`). |
| `SNAKE_CRASH` | Va chạm kết thúc trận (`reason`: `HIT_WALL`, `HIT_OBSTACLE`, `HIT_BODY`). |
| `BOT_FAILED`  | Bot lỗi hoặc quá giờ.                                             |
| `SNAKE_STATE` | Ảnh chụp trạng thái: quân `HEAD`, `BODY`, `FOOD`, `OBSTACLE`.      |
