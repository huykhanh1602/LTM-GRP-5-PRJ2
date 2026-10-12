import json
import unittest
from pathlib import Path

from engine.game_engine import (
    REASON_BASE_CAPTURED,
    TEAM_A,
    TEAM_B,
    GameConfig,
    GameEngine,
)


class FixedBot:
    def __init__(self, action):
        self.action = action

    def request(self, _payload):
        return {"status": "ok", "action": self.action}


def make_engine(team_a_base, team_b_base, move_to):
    config = GameConfig(
        {
            "board": {
                "width": 3,
                "height": 3,
                "special_tiles": [
                    {"type": "BASE", "owner": TEAM_A, "pos": team_a_base},
                    {"type": "BASE", "owner": TEAM_B, "pos": team_b_base},
                ],
            },
            "initial_state": [
                {"id": "A1", "owner": TEAM_A, "type": "ROCK", "pos": [0, 0]},
                {"id": "B1", "owner": TEAM_B, "type": "SCISSORS", "pos": [2, 0]},
            ],
            "limits": {"starting_team": TEAM_A},
        }
    )
    engine = GameEngine(
        config,
        {
            TEAM_A: FixedBot(
                {"piece_id": "A1", "action_type": "MOVE", "to": move_to}
            ),
            TEAM_B: FixedBot(
                {"piece_id": "B1", "action_type": "MOVE", "to": [2, 1]}
            ),
        },
    )
    engine._setup()
    return engine


class BaseCaptureTests(unittest.TestCase):
    def test_default_bases_are_on_the_opponent_starting_sides(self):
        config_path = Path(__file__).resolve().parents[1] / "config.json"
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        board = raw["board"]
        bases = {
            tile["owner"]: tile["pos"]
            for tile in board["special_tiles"]
            if tile["type"] == "BASE"
        }
        team_a_start_rows = {piece["pos"][1] for piece in raw["initial_state"] if piece["owner"] == TEAM_A}
        team_b_start_rows = {piece["pos"][1] for piece in raw["initial_state"] if piece["owner"] == TEAM_B}

        self.assertEqual(team_a_start_rows, {0})
        self.assertEqual(team_b_start_rows, {board["height"] - 1})
        self.assertEqual(bases[TEAM_B][1], board["height"] - 1)
        self.assertEqual(bases[TEAM_A][1], 0)

    def test_entering_own_base_does_not_win(self):
        engine = make_engine(team_a_base=[1, 1], team_b_base=[2, 2], move_to=[1, 1])
        turn = {"turn": 1, "player": TEAM_A, "actions": [], "events": []}

        engine._play_turn(TEAM_A, turn)

        self.assertIsNone(engine.game_over)
        self.assertFalse(any(event["type"] == "BASE_CAPTURED" for event in turn["events"]))

    def test_entering_opponent_base_wins(self):
        engine = make_engine(team_a_base=[2, 2], team_b_base=[1, 1], move_to=[1, 1])
        turn = {"turn": 1, "player": TEAM_A, "actions": [], "events": []}

        engine._play_turn(TEAM_A, turn)

        self.assertEqual(
            engine.game_over,
            {"winner": TEAM_A, "reason": REASON_BASE_CAPTURED},
        )
        self.assertIn(
            {"type": "BASE_CAPTURED", "team_id": TEAM_A, "location": [1, 1]},
            turn["events"],
        )


if __name__ == "__main__":
    unittest.main()
