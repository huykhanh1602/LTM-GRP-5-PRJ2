"""Bot mẫu 2 - tham lam tiến về Thành đối phương.

Chiến lược chấm điểm cho từng nước đi hợp lệ:

1. Ưu tiên tuyệt đối nước đi chiếm được Thành đối phương.
2. Kế đến là nước ăn quân địch (thắng theo oẳn tù tì).
3. Tránh nước đâm vào quân địch khắc chế mình hoặc va chạm cùng loại.
4. Trong các nước còn lại, chọn nước đưa quân tới gần Thành địch nhất
   (khoảng cách Chebyshev).
5. Nếu quân đứng ngay trên bẫy, trừ điểm mạnh để tránh tự sát.

Hợp đồng bot giống như mọi bot khác trong giải đấu.
"""

from __future__ import annotations

import random

_DIRECTIONS = (
    (-1, -1), (0, -1), (1, -1),
    (-1, 0), (1, 0),
    (-1, 1), (0, 1), (1, 1),
)


def _tiles_by_type(board_state, tile_type):
    return [
        tile
        for tile in board_state.get("special_tiles", [])
        if tile.get("type") == tile_type
    ]


def _obstacles(board_state):
    return {(t["pos"][0], t["pos"][1]) for t in _tiles_by_type(board_state, "OBSTACLE")}


def _traps(board_state):
    return {(t["pos"][0], t["pos"][1]) for t in _tiles_by_type(board_state, "TRAP")}


def _enemy_base(board_state, enemy_owner):
    for tile in _tiles_by_type(board_state, "BASE"):
        if tile.get("owner") == enemy_owner:
            return (tile["pos"][0], tile["pos"][1])
    return None


def _beats(attacker_type, defender_type, combat_map):
    """True nếu ``attacker_type`` khắc chế ``defender_type``."""
    return combat_map.get(attacker_type) == defender_type


def _chebyshev(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def make_move(board_state, my_pieces, opponent_pieces, config):
    """Chọn nước đi theo chiến lược tham lam."""
    if not my_pieces:
        return None

    width = board_state["width"]
    height = board_state["height"]
    obstacles = _obstacles(board_state)
    traps = _traps(board_state)

    my_owner = my_pieces[0]["owner"]
    enemy_owner = "team_b" if my_owner == "team_a" else "team_a"
    enemy_base = _enemy_base(board_state, enemy_owner)

    rules = config.get("rules", {}) if isinstance(config, dict) else {}
    combat_map = rules.get(
        "combat", {"ROCK": "SCISSORS", "SCISSORS": "PAPER", "PAPER": "ROCK"}
    )
    same_type_rule = rules.get("same_type_collision", "BOTH_DESTROYED")

    friendly = {(p["pos"][0], p["pos"][1]) for p in my_pieces}
    occupancy = {(p["pos"][0], p["pos"][1]): p for p in opponent_pieces}
    best_score = None
    best_moves = []

    for piece in my_pieces:
        px, py = piece["pos"][0], piece["pos"][1]
        my_type = piece["type"]

        for dx, dy in _DIRECTIONS:
            nx, ny = px + dx, py + dy
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if (nx, ny) in obstacles:
                continue
            if (nx, ny) in friendly:
                continue

            score = 0
            target = (nx, ny)

            # 1. Chiếm Thành địch.
            if enemy_base is not None and target == enemy_base:
                score += 100000

            # 2. Va chạm với quân địch tại ô đích.
            defender = occupancy.get(target)
            if defender is not None:
                if _beats(my_type, defender["type"], combat_map):
                    score += 1000
                elif my_type == defender["type"]:
                    # Cùng loại: tùy luật, mặc định cả hai cùng hủy.
                    score -= 50 if same_type_rule == "BOTH_DESTROYED" else 800
                else:
                    score -= 800

            # 3. Tránh giẫm vào bẫy.
            if target in traps:
                score -= 300

            # 4. Tiến gần Thành địch.
            if enemy_base is not None:
                score -= _chebyshev(target, enemy_base) * 10

            if best_score is None or score > best_score:
                best_score = score
                best_moves = [
                    {"piece_id": piece["id"], "action_type": "MOVE", "to": [nx, ny]}
                ]
            elif score == best_score:
                best_moves.append(
                    {"piece_id": piece["id"], "action_type": "MOVE", "to": [nx, ny]}
                )

    if not best_moves:
        return None

    return random.choice(best_moves)
