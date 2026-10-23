"""Bot mẫu Tham Lam (Greedy): Tìm đường ngắn nhất đến mồi gần nhất và tránh va chạm."""

def make_move(board_state, my_pieces, opponent_pieces, config):
    if not my_pieces:
        return {"action_type": "MOVE", "direction": "UP"}

    head_pos = my_pieces[0]["pos"]
    hx, hy = head_pos
    width = board_state["width"]
    height = board_state["height"]
    foods = board_state.get("foods", [])

    # Tập hợp các ô chứa thân mình hoặc thân đối thủ
    my_body = {tuple(p["pos"]) for p in my_pieces}
    opp_body = {tuple(p["pos"]) for p in opponent_pieces}
    obstacles = my_body | opp_body

    # Mục tiêu: mồi gần nhất theo khoảng cách Manhattan
    target = (width // 2, height // 2)
    if foods:
        best_dist = float("inf")
        for f in foods:
            dist = abs(f[0] - hx) + abs(f[1] - hy)
            if dist < best_dist:
                best_dist = dist
                target = tuple(f)

    # Đánh giá 4 hướng di chuyển: UP, DOWN, LEFT, RIGHT
    moves = [
        ("UP", (0, -1)),
        ("DOWN", (0, 1)),
        ("LEFT", (-1, 0)),
        ("RIGHT", (1, 0)),
    ]

    safe_moves = []
    for direction, (dx, dy) in moves:
        nx, ny = hx + dx, hy + dy
        # Không đâm tường và không đâm vào thân rắn
        if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in obstacles:
            dist = abs(nx - target[0]) + abs(ny - target[1])
            safe_moves.append((dist, direction))

    if safe_moves:
        # Chọn hướng giúp gần mồi nhất
        safe_moves.sort(key=lambda item: item[0])
        return {"action_type": "MOVE", "direction": safe_moves[0][1]}

    # Nếu cùng đường, đi đại một hướng
    return {"action_type": "MOVE", "direction": "UP"}
