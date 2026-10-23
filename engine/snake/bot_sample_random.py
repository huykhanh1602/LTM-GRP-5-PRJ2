"""Bot mẫu Ngẫu Nhiên: Chọn ngẫu nhiên một hướng an toàn."""

import random

def make_move(board_state, my_pieces, opponent_pieces, config):
    if not my_pieces:
        return {"action_type": "MOVE", "direction": "UP"}

    head_pos = my_pieces[0]["pos"]
    hx, hy = head_pos
    width = board_state["width"]
    height = board_state["height"]

    obstacles = {tuple(p["pos"]) for p in my_pieces} | {tuple(p["pos"]) for p in opponent_pieces}
    moves = [
        ("UP", (0, -1)),
        ("DOWN", (0, 1)),
        ("LEFT", (-1, 0)),
        ("RIGHT", (1, 0)),
    ]

    safe_directions = []
    for direction, (dx, dy) in moves:
        nx, ny = hx + dx, hy + dy
        if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in obstacles:
            safe_directions.append(direction)

    if safe_directions:
        return {"action_type": "MOVE", "direction": random.choice(safe_directions)}

    return {"action_type": "MOVE", "direction": "UP"}
