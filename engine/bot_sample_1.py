"""Bot mẫu 1 - chọn ngẫu nhiên một nước đi hợp lệ.

Hợp đồng bot (giống mọi bot khác tham gia giải đấu):

    make_move(board_state, my_pieces, opponent_pieces, config) -> dict | None

* ``board_state``   : dict mô tả bàn cờ tại thời điểm gọi
                      (width, height, coordinate_system, special_tiles, turn...).
* ``my_pieces``     : danh sách quân cờ của đội mình (chỉ các quân còn sống).
* ``opponent_pieces``: danh sách quân cờ đối phương.
* ``config``        : nguyên văn nội dung ``config.json``.

Giá trị trả về: ``{ "piece_id": str, "action_type": "MOVE", "to": [x, y] }``
hoặc ``None`` nếu bỏ lượt.

Bot này chỉ tạo ra các nước đi **hợp lệ** theo luật 8 hướng 1 ô:
không ra ngoài bàn, không vào ô chướng ngại vật, không đè lên quân mình.
"""

from __future__ import annotations

import random

# 8 hướng, mỗi bước đi đúng 1 ô.
_DIRECTIONS = (
    (-1, -1), (0, -1), (1, -1),
    (-1, 0), (1, 0),
    (-1, 1), (0, 1), (1, 1),
)


def _obstacles(board_state):
    """Tập hợp tọa độ các ô chướng ngại vật."""
    obstacles = set()
    for tile in board_state.get("special_tiles", []):
        if tile.get("type") == "OBSTACLE":
            obstacles.add((tile["pos"][0], tile["pos"][1]))
    return obstacles


def _valid_candidates(board_state, my_pieces):
    """Sinh tất cả nước đi hợp lệ cơ bản cho từng quân."""
    width = board_state["width"]
    height = board_state["height"]
    obstacles = _obstacles(board_state)
    friendly = {(p["pos"][0], p["pos"][1]) for p in my_pieces}

    candidates = []
    for piece in my_pieces:
        x, y = piece["pos"][0], piece["pos"][1]
        for dx, dy in _DIRECTIONS:
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if (nx, ny) in obstacles:
                continue
            if (nx, ny) in friendly:
                continue
            candidates.append(
                {
                    "piece_id": piece["id"],
                    "action_type": "MOVE",
                    "to": [nx, ny],
                }
            )
    return candidates


def make_move(board_state, my_pieces, opponent_pieces, config):
    """Chọn một nước đi hợp lệ ngẫu nhiên."""
    if not my_pieces:
        return None

    candidates = _valid_candidates(board_state, my_pieces)
    if not candidates:
        return None

    return random.choice(candidates)
