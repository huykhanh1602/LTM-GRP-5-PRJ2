"""Bot 3: ưu tiên bắt quân có lợi, tránh bẫy, rồi tiến về căn cứ địch."""


def make_move(board_state, my_pieces, opponent_pieces, config):
    if not my_pieces:
        return None
    width, height = board_state['width'], board_state['height']
    tiles = board_state.get('special_tiles', [])
    blocked = {tuple(t['pos']) for t in tiles if t['type'] in ('OBSTACLE', 'TRAP')}
    friendly = {tuple(p['pos']) for p in my_pieces}
    enemies = {tuple(p['pos']): p for p in opponent_pieces}
    owner = my_pieces[0]['owner']
    base = next((tuple(t['pos']) for t in tiles if t['type'] == 'BASE' and t['owner'] != owner), None)
    beats = config.get('rules', {}).get('combat', {'ROCK': 'SCISSORS', 'PAPER': 'ROCK', 'SCISSORS': 'PAPER'})
    candidates = []
    for piece in sorted(my_pieces, key=lambda p: p['id']):
        x, y = piece['pos']
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                target = (x + dx, y + dy)
                if (dx == dy == 0 or not (0 <= target[0] < width and 0 <= target[1] < height)
                        or target in blocked or target in friendly):
                    continue
                score = 10000 if target == base else 0
                enemy = enemies.get(target)
                if enemy:
                    score += 500 if beats.get(piece['type']) == enemy['type'] else -1000
                if base:
                    score -= max(abs(target[0] - base[0]), abs(target[1] - base[1])) * 5
                candidates.append((score, {'piece_id': piece['id'], 'action_type': 'MOVE', 'to': list(target)}))
    return max(candidates, key=lambda move: move[0])[1] if candidates else None
