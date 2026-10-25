"""Engine trò chơi Rắn Săn Mồi Đối Kháng (Snake Bot Battle) giữa 2 bot Python."""

from __future__ import annotations

import json
import random
from typing import Any, Dict, List, Optional, Tuple

TEAM_A = "team_a"
TEAM_B = "team_b"
TEAMS = (TEAM_A, TEAM_B)

DIR_OFFSETS = {
    "UP": (0, -1),
    "DOWN": (0, 1),
    "LEFT": (-1, 0),
    "RIGHT": (1, 0),
}


class SnakeEngine:
    """Điều khiển trận đấu Snake giữa 2 bot."""

    def __init__(self, config: Dict[str, Any], adapters: Dict[str, Any]) -> None:
        self.config = config
        self.adapters = adapters
        board_conf = config.get("board", {})
        self.width = int(board_conf.get("width", 16))
        self.height = int(board_conf.get("height", 16))
        limits = config.get("limits", {})
        self.max_turns = int(limits.get("max_turns", 200))
        self.food_count = int(limits.get("food_count", config.get("food_count", 5)))
        # Seed cố định để mồi sinh ra lặp lại được; lưu vào replay để tái hiện đúng ván.
        seed = config.get("seed")
        if seed is None:
            seed = random.SystemRandom().randrange(2**32)
        self.seed = int(seed)
        self.rng = random.Random(self.seed)

        # Mỗi con rắn là danh sách tọa độ [(x, y), ...], phần tử 0 là ĐẦU
        self.snakes: Dict[str, List[Tuple[int, int]]] = {
            TEAM_A: [(3, 3), (3, 2), (3, 1)],
            TEAM_B: [
                (self.width - 4, self.height - 4),
                (self.width - 4, self.height - 3),
                (self.width - 4, self.height - 2),
            ],
        }
        self.scores: Dict[str, int] = {TEAM_A: 0, TEAM_B: 0}
        self.alive: Dict[str, bool] = {TEAM_A: True, TEAM_B: True}
        self.foods: List[Tuple[int, int]] = []
        self._init_foods()

        self.turns: List[Dict[str, Any]] = []
        self.turn_number = 0
        self.game_over: Optional[Dict[str, Any]] = None

    def _init_foods(self) -> None:
        occupied = set(self.snakes[TEAM_A] + self.snakes[TEAM_B])
        while len(self.foods) < self.food_count:
            fx = self.rng.randint(0, self.width - 1)
            fy = self.rng.randint(0, self.height - 1)
            pos = (fx, fy)
            if pos not in occupied and pos not in self.foods:
                self.foods.append(pos)

    def _spawn_food(self) -> None:
        occupied = set(self.snakes[TEAM_A] + self.snakes[TEAM_B] + self.foods)
        all_cells = [(x, y) for x in range(self.width) for y in range(self.height)]
        available = [c for c in all_cells if c not in occupied]
        if available:
            self.foods.append(self.rng.choice(available))

    def _get_pieces_list(self) -> List[Dict[str, Any]]:
        pieces: List[Dict[str, Any]] = []
        for team in TEAMS:
            snake = self.snakes[team]
            for i, pos in enumerate(snake):
                p_type = "HEAD" if i == 0 else "BODY"
                p_id = f"{'A' if team == TEAM_A else 'B'}_{p_type}_{i}"
                pieces.append({
                    "id": p_id,
                    "owner": team,
                    "type": p_type,
                    "pos": list(pos),
                    "hp": 1,
                    "alive": self.alive[team],
                })
        for i, fpos in enumerate(self.foods):
            pieces.append({
                "id": f"FOOD_{i+1}",
                "owner": "neutral",
                "type": "FOOD",
                "pos": list(fpos),
                "hp": 1,
                "alive": True,
            })
        return pieces

    def _snapshot_event(self) -> Dict[str, Any]:
        return {
            "type": "SNAKE_STATE",
            "pieces": self._get_pieces_list(),
            "scores": dict(self.scores),
        }

    def initial_state(self) -> List[Dict[str, Any]]:
        return self._get_pieces_list()

    def run(self, on_event=None) -> Dict[str, Any]:
        match_info = {
            "match_id": self.config.get("match", {}).get("match_id", "M-SNAKE-DEFAULT"),
            "teams": self.config.get("match", {}).get(
                "teams", {TEAM_A: "Snake Đội A", TEAM_B: "Snake Đội B"}
            ),
            "game_id": "snake_battle",
        }
        init_event = {
            "type": "match_start",
            "match_info": match_info,
            "game_config": {
                "board": {
                    "width": self.width,
                    "height": self.height,
                    "coordinate_system": "TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN",
                    "special_tiles": [],
                },
                "limits": self.config.get("limits", {}),
                "seed": self.seed,
            },
            "initial_state": self.initial_state(),
        }
        if on_event:
            on_event(init_event)

        current_team = TEAM_A
        while not self.game_over and self.turn_number < self.max_turns:
            self.turn_number += 1
            other_team = TEAM_B if current_team == TEAM_A else TEAM_A

            payload = {
                "board_state": {
                    "width": self.width,
                    "height": self.height,
                    "turn": self.turn_number,
                    "current_player": current_team,
                    "foods": [list(f) for f in self.foods],
                    "score": self.scores[current_team],
                    "opponent_score": self.scores[other_team],
                },
                "my_pieces": [
                    {"id": f"SEG_{i}", "type": "HEAD" if i == 0 else "BODY", "pos": list(p)}
                    for i, p in enumerate(self.snakes[current_team])
                ],
                "opponent_pieces": [
                    {"id": f"OPP_{i}", "type": "HEAD" if i == 0 else "BODY", "pos": list(p)}
                    for i, p in enumerate(self.snakes[other_team])
                ],
                "config": self.config,
            }

            resp = self.adapters[current_team].request(payload)
            turn_record = self._apply_turn(current_team, resp)
            # Ảnh chụp toàn bộ trạng thái sau lượt: giao diện chỉ việc áp lên, không tự tính luật
            # (thân rắn dài ra/ngắn lại, mồi mới sinh đều nằm trong ảnh chụp này).
            turn_record["events"].append(self._snapshot_event())
            self.turns.append(turn_record)
            if on_event:
                on_event({"type": "turn", "turn": turn_record})

            if self.game_over:
                break
            current_team = other_team

        if not self.game_over:
            if self.scores[TEAM_A] > self.scores[TEAM_B]:
                winner = TEAM_A
                reason = "SCORE_LEAD"
            elif self.scores[TEAM_B] > self.scores[TEAM_A]:
                winner = TEAM_B
                reason = "SCORE_LEAD"
            else:
                winner = None
                reason = "DRAW"
            self.game_over = {"winner": winner, "reason": reason}

        match_info["total_turns"] = self.turn_number
        match_info["winner"] = self.game_over["winner"]
        match_info["win_reason"] = self.game_over["reason"]
        match_info["final_scores"] = self.scores

        end_event = {
            "type": "match_end",
            "match_id": match_info["match_id"],
            "winner": self.game_over["winner"],
            "reason": self.game_over["reason"],
            "scores": self.scores,
        }
        if on_event:
            on_event(end_event)

        return {
            "match_info": match_info,
            "game_config": init_event["game_config"],
            "initial_state": init_event["initial_state"],
            "turns": self.turns,
        }

    def _apply_turn(self, team: str, resp: Dict[str, Any]) -> Dict[str, Any]:
        other_team = TEAM_B if team == TEAM_A else TEAM_A
        snake = self.snakes[team]
        head_x, head_y = snake[0]

        status = resp.get("status")
        if status != "ok":
            self.alive[team] = False
            self.game_over = {
                "winner": other_team,
                "reason": f"BOT_{status.upper() if status else 'ERROR'}",
            }
            return {
                "turn": self.turn_number,
                "player": team,
                "actions": [],
                "events": [
                    {"type": "BOT_FAILED", "team": team, "status": status, "error": resp.get("error")}
                ],
            }

        action = resp.get("action")
        direction = None
        if isinstance(action, str):
            direction = action.upper()
        elif isinstance(action, dict):
            direction = action.get("direction") or action.get("action_type")
            if direction:
                direction = str(direction).upper()
            elif "to" in action and isinstance(action["to"], (list, tuple)) and len(action["to"]) == 2:
                tx, ty = action["to"]
                dx, dy = tx - head_x, ty - head_y
                for d, (ox, oy) in DIR_OFFSETS.items():
                    if (ox, oy) == (dx, dy):
                        direction = d
                        break

        if direction not in DIR_OFFSETS:
            self.alive[team] = False
            self.game_over = {"winner": other_team, "reason": "ILLEGAL_MOVE"}
            return {
                "turn": self.turn_number,
                "player": team,
                "actions": [],
                "events": [{"type": "ILLEGAL_MOVE", "team": team, "raw": action}],
            }

        dx, dy = DIR_OFFSETS[direction]
        new_head = (head_x + dx, head_y + dy)
        events = []

        # Kiểm tra đâm vào viền tường
        if (
            new_head[0] < 0
            or new_head[0] >= self.width
            or new_head[1] < 0
            or new_head[1] >= self.height
        ):
            self.alive[team] = False
            self.game_over = {"winner": other_team, "reason": "SNAKE_HIT_WALL"}
            events.append({
                "type": "SNAKE_CRASH",
                "team": team,
                "reason": "HIT_WALL",
                "pos": list(new_head),
            })
            return {
                "turn": self.turn_number,
                "player": team,
                "actions": [{
                    "piece_id": f"{'A' if team == TEAM_A else 'B'}_HEAD_0",
                    "action_type": "MOVE",
                    "from": [head_x, head_y],
                    "to": list(new_head),
                }],
                "events": events,
            }

        # Kiểm tra đâm vào thân mình hoặc thân đối thủ
        if new_head in snake[:-1] or new_head in self.snakes[other_team]:
            self.alive[team] = False
            self.game_over = {"winner": other_team, "reason": "SNAKE_HIT_BODY"}
            events.append({
                "type": "SNAKE_CRASH",
                "team": team,
                "reason": "HIT_BODY",
                "pos": list(new_head),
            })
            return {
                "turn": self.turn_number,
                "player": team,
                "actions": [{
                    "piece_id": f"{'A' if team == TEAM_A else 'B'}_HEAD_0",
                    "action_type": "MOVE",
                    "from": [head_x, head_y],
                    "to": list(new_head),
                }],
                "events": events,
            }

        actions = [{
            "piece_id": f"{'A' if team == TEAM_A else 'B'}_HEAD_0",
            "action_type": "MOVE",
            "from": [head_x, head_y],
            "to": list(new_head),
        }]
        snake.insert(0, new_head)

        if new_head in self.foods:
            self.foods.remove(new_head)
            self.scores[team] += 10
            events.append({
                "type": "FOOD_EATEN",
                "team": team,
                "pos": list(new_head),
                "score": self.scores[team],
            })
            self._spawn_food()
        else:
            snake.pop()

        return {
            "turn": self.turn_number,
            "player": team,
            "actions": actions,
            "events": events,
            "score": self.scores[team],
        }
