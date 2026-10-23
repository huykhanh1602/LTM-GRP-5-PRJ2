import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from snake_engine import SnakeEngine, TEAM_A, TEAM_B  # noqa: E402

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "config.json").read_text(encoding="utf-8"))


class Fixed:
    def __init__(self, *moves):
        self.moves = list(moves)

    def request(self, _payload):
        move = self.moves.pop(0) if len(self.moves) > 1 else self.moves[0]
        if move == "FAIL":
            return {"status": "timeout"}
        return {"status": "ok", "action": {"action_type": "MOVE", "direction": move}}


def run(bot_a, bot_b, **limits):
    config = json.loads(json.dumps(CONFIG))
    config["seed"] = 7
    config["limits"].update(limits)
    return SnakeEngine(config, {TEAM_A: bot_a, TEAM_B: bot_b}).run()


class SnakeEngineTest(unittest.TestCase):
    def test_same_seed_gives_identical_replay(self):
        a = run(Fixed("DOWN"), Fixed("UP"), max_turns=30)
        b = run(Fixed("DOWN"), Fixed("UP"), max_turns=30)
        self.assertEqual(a, b)
        self.assertEqual(a["game_config"]["seed"], 7)

    def test_every_turn_has_snapshot_with_current_food_and_snakes(self):
        replay = run(Fixed("RIGHT"), Fixed("LEFT"), max_turns=10)
        for turn in replay["turns"]:
            snap = [e for e in turn["events"] if e["type"] == "SNAKE_STATE"]
            self.assertEqual(len(snap), 1)
            types = [p["type"] for p in snap[0]["pieces"]]
            self.assertEqual(types.count("HEAD"), 2)
            self.assertEqual(types.count("FOOD"), 5)

    def test_wall_crash_ends_match_and_other_team_wins(self):
        replay = run(Fixed("LEFT"), Fixed("UP"), max_turns=50)
        # team_a bắt đầu ở x=3, đi sang trái đến khi đâm tường
        self.assertEqual(replay["match_info"]["winner"], TEAM_B)
        self.assertEqual(replay["match_info"]["win_reason"], "SNAKE_HIT_WALL")

    def test_bot_failure_loses(self):
        replay = run(Fixed("FAIL"), Fixed("UP"), max_turns=20)
        self.assertEqual(replay["match_info"]["winner"], TEAM_B)

    def test_draw_when_scores_equal_at_max_turns(self):
        replay = run(Fixed("DOWN", "UP"), Fixed("UP", "DOWN"), max_turns=2)
        self.assertIsNone(replay["match_info"]["winner"])
        self.assertEqual(replay["match_info"]["win_reason"], "DRAW")

    def test_food_count_from_limits(self):
        replay = run(Fixed("DOWN"), Fixed("UP"), max_turns=2, food_count=3)
        foods = [p for p in replay["initial_state"] if p["type"] == "FOOD"]
        self.assertEqual(len(foods), 3)


if __name__ == "__main__":
    unittest.main()
