import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from snake_engine import SnakeEngine, TEAM_A, TEAM_B  # noqa: E402

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "config.json").read_text(encoding="utf-8"))


class Dummy:
    def request(self, _payload):
        return {"status": "ok", "action": {"action_type": "MOVE", "direction": "RIGHT"}}


def engine(**rules):
    config = json.loads(json.dumps(CONFIG))
    config["seed"] = 3
    config["rules"]["tail_shed"].update(rules)
    return SnakeEngine(config, {TEAM_A: Dummy(), TEAM_B: Dummy()})


def move(eng, team, direction):
    eng.turn_number += 1
    return eng._apply_turn(team, {"status": "ok", "action": {"action_type": "MOVE", "direction": direction}})


def long_snake(eng, team=TEAM_A, length=6):
    # Rắn thẳng đứng: đầu (8, 8), thân kéo lên (8, 7), (8, 6)...; cho đi DOWN thì không đâm gì.
    eng.snakes[team] = [(8, 8 - i) for i in range(length)]
    return eng.snakes[team]


class TailShedTest(unittest.TestCase):
    def test_config_defaults_match_rule(self):
        eng = engine()
        self.assertEqual((eng.shed_every, eng.shed_min_length, eng.shed_count), (5, 4, 2))

    def test_snake_longer_than_four_sheds_two_cells_on_every_fifth_move(self):
        eng = engine()
        long_snake(eng, TEAM_A, 6)
        eng.foods = []  # tránh ăn mồi làm đổi độ dài
        events = []
        for i in range(5):
            record = move(eng, TEAM_A, "DOWN")
            events.extend(record["events"])
        shed = [e for e in events if e["type"] == "TAIL_SHED"]
        self.assertEqual(len(shed), 1)
        self.assertEqual(len(eng.snakes[TEAM_A]), 4)           # 6 - 2
        self.assertEqual(shed[0]["remaining_length"], 4)
        self.assertEqual(len(shed[0]["cells"]), 2)
        self.assertEqual({pos for pos, _ in eng.obstacles}, {tuple(c) for c in shed[0]["cells"]})
        self.assertTrue(all(source == TEAM_A for _, source in eng.obstacles))

    def test_no_shed_when_length_is_four_or_less(self):
        eng = engine()
        long_snake(eng, TEAM_A, 4)
        eng.foods = []
        for _ in range(5):
            record = move(eng, TEAM_A, "DOWN")
        self.assertEqual(eng.obstacles, [])
        self.assertEqual(len(eng.snakes[TEAM_A]), 4)

    def test_counter_is_per_snake(self):
        eng = engine()
        long_snake(eng, TEAM_A, 6)
        eng.snakes[TEAM_B] = [(12, 3), (12, 4), (12, 5), (12, 6), (12, 7)]
        eng.foods = []
        for _ in range(4):
            move(eng, TEAM_A, "DOWN")
            move(eng, TEAM_B, "UP")                  # B cũng đi, nhưng bộ đếm của từng rắn tách biệt
        self.assertEqual(eng.obstacles, [])          # mỗi rắn mới đi 4 nước
        move(eng, TEAM_A, "DOWN")
        self.assertEqual({source for _, source in eng.obstacles}, {TEAM_A})  # chỉ A đủ 5 nước
        self.assertEqual(len(eng.snakes[TEAM_B]), 5)

    def test_hitting_a_dropped_tail_loses_even_for_its_owner(self):
        eng = engine()
        eng.obstacles = [((5, 5), TEAM_A)]
        eng.snakes[TEAM_A] = [(5, 6), (5, 7), (5, 8)]
        record = move(eng, TEAM_A, "UP")             # đầu bước vào (5,5)
        self.assertEqual(eng.game_over["reason"], "SNAKE_HIT_OBSTACLE")
        self.assertEqual(eng.game_over["winner"], TEAM_B)
        crash = [e for e in record["events"] if e["type"] == "SNAKE_CRASH"][0]
        self.assertEqual(crash["reason"], "HIT_OBSTACLE")

    def test_opponent_hitting_it_also_loses(self):
        eng = engine()
        eng.obstacles = [((10, 9), TEAM_A)]
        eng.snakes[TEAM_B] = [(11, 9), (12, 9), (13, 9)]
        move(eng, TEAM_B, "LEFT")
        self.assertEqual(eng.game_over["winner"], TEAM_A)
        self.assertEqual(eng.game_over["reason"], "SNAKE_HIT_OBSTACLE")

    def test_obstacles_are_visible_to_bots_and_snapshot(self):
        eng = engine()
        eng.obstacles = [((4, 4), TEAM_B)]
        payloads = []

        class Spy:
            def request(self, payload):
                payloads.append(payload)
                return {"status": "ok", "action": {"action_type": "MOVE", "direction": "DOWN"}}

        eng.adapters = {TEAM_A: Spy(), TEAM_B: Spy()}
        eng.max_turns = 1
        replay = eng.run()
        self.assertEqual(payloads[0]["board_state"]["obstacles"], [[4, 4]])
        pieces = replay["turns"][0]["events"][-1]["pieces"]
        obstacle = [p for p in pieces if p["type"] == "OBSTACLE"]
        self.assertEqual(obstacle[0]["pos"], [4, 4])
        self.assertEqual(obstacle[0]["source"], TEAM_B)

    def test_food_never_spawns_on_a_dropped_tail(self):
        eng = engine()
        eng.obstacles = [((x, y), TEAM_A) for x in range(16) for y in range(16) if (x + y) % 2 == 0]
        for _ in range(40):
            eng.foods = []
            eng._spawn_food()
            self.assertNotIn(eng.foods[0], eng._obstacle_cells())


if __name__ == "__main__":
    unittest.main()
