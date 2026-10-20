"""Bot phòng thủ thông minh - bảo vệ Thành nhà trước, rồi mới tấn công.

Hợp đồng giống mọi bot khác:  make_move(board_state, my_pieces, opponent_pieces, config)
trả về {"piece_id": ..., "action_type": "MOVE", "to": [x, y]} hoặc None.

Cách nghĩ (tìm kiếm 2 lượt: nước của mình, rồi câu trả lời tốt nhất của địch):

1. Mỗi nước đi của mình được thử trên bàn cờ giả, rồi thử MỌI nước đáp trả của địch.
   Nước đi được điểm theo kết quả TỆ NHẤT mà địch có thể gây ra
   -> không bao giờ để địch chiếm Thành nếu còn cách tránh.
2. Quân địch đứng sát Thành mình (1 ô) là mối đe dọa chết người:
   - Có quân mình hạ được nó (khắc chế hoặc hòa cùng loại) -> chấp nhận, tốn 1 lượt.
   - Có từ 2 quân sát Thành, hoặc không ai hạ được -> coi như thua.
3. Giữ đủ "lính gác" quanh Thành: càng có địch tiến gần, càng cần nhiều lính gác.
   Mỗi địch tiến gần nên có quân mình khắc chế nó ở gần.
4. Nếu có quân sát Thành địch mà địch không kịp xử -> thắng ở lượt sau, điểm cực cao.
5. Tránh bẫy, tránh đâm vào quân khắc chế mình (đã thể hiện qua mô phỏng).

Giả định (chỉnh ở đầu file nếu engine khác):
- 8 hướng, đi 1 ô; không đi vào ô vật cản, ô quân mình, và ô Thành của chính mình.
- Quân đứng trên bẫy bị hủy (trap_effect = DESTROYED).
- Đi vào ô Thành địch = thắng ngay.
- Quân địch có loại UNKNOWN được coi là hòa cùng loại (cùng bị hủy).
"""

from __future__ import annotations

import random
import time

_DIRECTIONS = (
    (-1, -1), (0, -1), (1, -1),
    (-1, 0), (1, 0),
    (-1, 1), (0, 1), (1, 1),
)

_DEFAULT_COMBAT = {"ROCK": "SCISSORS", "SCISSORS": "PAPER", "PAPER": "ROCK"}

# ---- Điểm số (có thể chỉnh) ----
_WIN = 1_000_000          # thắng ngay
_WIN_NEXT = 90_000        # có quân sát Thành địch và địch không kịp xử: thắng lượt sau
_LOSE_NEXT = -80_000      # địch sắp chiếm Thành mình mà mình không cản được
_MATERIAL = 100           # giá trị mỗi quân
_GUARD_WEIGHT = 45        # thưởng mỗi lính gác quanh Thành nhà (tới số cần thiết)
_TIME_FRACTION = 0.4      # chỉ dùng tối đa 40% thời gian cho phép mỗi nước


def _cheb(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


class _Ctx:
    """Thông tin cố định của ván cờ."""

    def __init__(self, board_state, my_pieces, config):
        self.width = board_state["width"]
        self.height = board_state["height"]
        tiles = board_state.get("special_tiles", [])
        self.obstacles = {tuple(t["pos"]) for t in tiles if t.get("type") == "OBSTACLE"}
        self.traps = {tuple(t["pos"]) for t in tiles if t.get("type") == "TRAP"}

        self.my_owner = my_pieces[0]["owner"]
        self.enemy_owner = "team_b" if self.my_owner == "team_a" else "team_a"
        self.my_base = self.enemy_base = None
        for t in tiles:
            if t.get("type") == "BASE":
                if t.get("owner") == self.my_owner:
                    self.my_base = tuple(t["pos"])
                elif t.get("owner") == self.enemy_owner:
                    self.enemy_base = tuple(t["pos"])

        cfg = config if isinstance(config, dict) else {}
        rules = cfg.get("rules", {})
        self.combat = rules.get("combat", _DEFAULT_COMBAT)
        self.same_rule = rules.get("same_type_collision", "BOTH_DESTROYED")
        self.trap_kills = rules.get("trap_effect", "DESTROYED") == "DESTROYED"
        limit_ms = cfg.get("limits", {}).get("bot_time_ms", 1000)
        self.budget = max(0.05, limit_ms / 1000.0 * _TIME_FRACTION)

    def beats(self, a, b):
        return self.combat.get(a) == b


# Trạng thái giả: {(x, y): (là_của_mình: bool, loại: str, id: str)}

def _legal_moves(state, mine, ctx):
    own_base = ctx.my_base if mine else ctx.enemy_base
    moves = []
    for (x, y), (is_mine, _, _) in state.items():
        if is_mine != mine:
            continue
        for dx, dy in _DIRECTIONS:
            to = (x + dx, y + dy)
            if not (0 <= to[0] < ctx.width and 0 <= to[1] < ctx.height):
                continue
            if to in ctx.obstacles or to == own_base:
                continue
            other = state.get(to)
            if other is not None and other[0] == mine:
                continue
            moves.append(((x, y), to))
    return moves


def _apply(state, frm, to, mine, ctx):
    """Đi thử một nước. Trả về (trạng thái mới, đã_chiếm_thành)."""
    piece = state[frm]
    new = dict(state)
    del new[frm]
    target_base = ctx.enemy_base if mine else ctx.my_base
    if to == target_base:
        new[to] = piece
        return new, True

    defender = state.get(to)
    if defender is None:
        new[to] = piece
    else:
        a, d = piece[1], defender[1]
        if ctx.beats(a, d):
            new[to] = piece
        elif ctx.beats(d, a):
            pass  # quân đi vào bị hạ, quân đứng yên còn nguyên trong new[to]
        elif a == d and ctx.same_rule != "BOTH_DESTROYED":
            new[frm] = piece  # bật lại
        else:
            del new[to]  # cùng loại (hoặc không rõ loại): cùng bị hủy

    if ctx.trap_kills and to in ctx.traps and new.get(to) is piece:
        del new[to]
    return new, False


def _can_kill(state, target, ctx):
    """Có quân mình đứng cạnh `target` và hạ được nó (khắc chế hoặc đổi quân) không?"""
    t_type = state[target][1]
    for pos, (is_mine, p_type, _) in state.items():
        if not is_mine or _cheb(pos, target) != 1:
            continue
        if ctx.beats(p_type, t_type):
            return True
        if p_type == t_type and ctx.same_rule == "BOTH_DESTROYED":
            return True
    return False


def _evaluate(state, ctx):
    """Điểm của thế cờ sau khi địch đã đi, tới lượt mình (cao = tốt cho mình)."""
    mine = [(p, v[1]) for p, v in state.items() if v[0]]
    theirs = [(p, v[1]) for p, v in state.items() if not v[0]]
    if not mine:
        return -_WIN
    if not theirs:
        return _WIN

    score = _MATERIAL * (len(mine) - len(theirs))

    # Tới lượt mình: có quân sát Thành địch thì chiếm luôn.
    if ctx.enemy_base is not None and any(_cheb(p, ctx.enemy_base) <= 1 for p, _ in mine):
        return _WIN_NEXT + score

    # Địch sát Thành mình: phải hạ ngay, mà chỉ hạ được 1 quân/lượt.
    if ctx.my_base is not None:
        threats = [p for p, _ in theirs if _cheb(p, ctx.my_base) <= 1]
        if threats:
            if len(threats) >= 2 or not _can_kill(state, threats[0], ctx):
                return _LOSE_NEXT + score
            score -= 300  # hạ được, nhưng tốn cả lượt

        dmin = min(_cheb(p, ctx.my_base) for p, _ in theirs)

        # Lính gác quanh Thành: địch càng gần càng cần nhiều.
        need = min(6, 2 + max(0, 6 - dmin))
        guards = sum(1 for p, _ in mine if _cheb(p, ctx.my_base) <= 2)
        score += _GUARD_WEIGHT * min(guards, need)

        for p, t in theirs:
            d = _cheb(p, ctx.my_base)
            if d > 4:
                continue
            score -= max(0, 5 - d) * 25                       # địch tiến gần Thành
            counter = any(
                _cheb(q, p) <= 2 and ctx.beats(qt, t) for q, qt in mine
            )
            weight = 5 - d
            score += (40 if counter else -60) * weight // 2   # có quân khắc chế nó gần đó không

    # Tấn công: quân mình tiến gần Thành địch (nhẹ hơn phòng thủ).
    if ctx.enemy_base is not None:
        dm = min(_cheb(p, ctx.enemy_base) for p, _ in mine)
        score += 14 * (max(ctx.width, ctx.height) - dm)
        for p, t in mine:
            if _cheb(p, ctx.enemy_base) > 3:
                continue
            for e, et in theirs:
                if _cheb(p, e) <= 2:
                    if ctx.beats(et, t):
                        score -= 40
                    elif ctx.beats(t, et):
                        score += 20
    return score


def _quick_score(state, frm, to, ctx):
    """Điểm sơ bộ chỉ để quyết định nước nào xét trước (xét nước tốt trước)."""
    s = 0
    if to == ctx.enemy_base:
        return 10**9
    defender = state.get(to)
    t = state[frm][1]
    if defender is not None:
        d = defender[1]
        if ctx.beats(t, d):
            s += 500
            if ctx.my_base is not None and _cheb(to, ctx.my_base) <= 2:
                s += 300
        elif t == d:
            s += 100
        else:
            s -= 500
    if to in ctx.traps:
        s -= 1000
    if ctx.enemy_base is not None:
        s += 10 * (_cheb(frm, ctx.enemy_base) - _cheb(to, ctx.enemy_base))
    return s


def make_move(board_state, my_pieces, opponent_pieces, config):
    """Chọn nước đi: tìm kiếm 2 lượt, ưu tiên không để mất Thành."""
    if not my_pieces:
        return None
    started = time.perf_counter()
    ctx = _Ctx(board_state, my_pieces, config)

    state = {}
    for p in opponent_pieces:
        state[tuple(p["pos"])] = (False, p["type"], p["id"])
    for p in my_pieces:
        state[tuple(p["pos"])] = (True, p["type"], p["id"])

    my_moves = _legal_moves(state, True, ctx)
    if not my_moves:
        return None
    my_moves.sort(key=lambda m: _quick_score(state, m[0], m[1], ctx), reverse=True)

    best_value = None
    best = []
    for i, (frm, to) in enumerate(my_moves):
        if i > 0 and time.perf_counter() - started > ctx.budget:
            break  # hết thời gian: dùng kết quả tốt nhất đã có

        after, won = _apply(state, frm, to, True, ctx)
        if won:
            value = _WIN
        else:
            # Địch chọn câu trả lời tệ nhất cho mình.
            replies = _legal_moves(after, False, ctx)
            if not replies:
                value = _evaluate(after, ctx)
            else:
                value = None
                for rfrm, rto in replies:
                    after2, enemy_won = _apply(after, rfrm, rto, False, ctx)
                    v = -_WIN if enemy_won else _evaluate(after2, ctx)
                    if value is None or v < value:
                        value = v
                        if best_value is not None and value < best_value:
                            break  # nước này đã tệ hơn nước tốt nhất, khỏi xét tiếp

        if best_value is None or value > best_value:
            best_value, best = value, [(frm, to)]
        elif value == best_value:
            best.append((frm, to))

    frm, to = random.choice(best)
    return {"piece_id": state[frm][2], "action_type": "MOVE", "to": [to[0], to[1]]}