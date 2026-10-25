"""Chạy thật match_runner.py (Oẳn Tù Tì) với một đội do người thật điều khiển."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OBSTACLES = {(3, 3), (4, 4)}
NEIGHBOURS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def pick_legal_move(payload):
    """Chọn quân và ô đích kề bên còn trống, giống cách giao diện gợi ý nước đi."""
    board = payload["board_state"]
    occupied = {tuple(p["pos"]) for p in payload["my_pieces"]}
    for piece in payload["my_pieces"]:
        x, y = piece["pos"]
        for dx, dy in NEIGHBOURS:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < board["width"] and 0 <= ny < board["height"]):
                continue
            if (nx, ny) in OBSTACLES or (nx, ny) in occupied:
                continue
            return {"action_type": "MOVE", "piece_id": piece["id"], "to": [nx, ny]}
    return {"action_type": "MOVE", "piece_id": payload["my_pieces"][0]["id"], "to": [0, 0]}


class RpsHumanControlTests(unittest.TestCase):
    def test_doi_a_di_bang_chuot_doi_b_van_chay_bot(self):
        with tempfile.TemporaryDirectory() as workdir:
            config_path = os.path.join(workdir, "config.json")
            out_path = os.path.join(workdir, "replay.json")
            with open(os.path.join(REPO_ROOT, "engine", "config.json"), encoding="utf-8") as handle:
                config = json.load(handle)
            config["seed"] = 7
            config["limits"]["max_turns"] = 6
            with open(config_path, "w", encoding="utf-8") as handle:
                json.dump(config, handle)

            child = subprocess.Popen(
                [
                    sys.executable, os.path.join("engine", "match_runner.py"),
                    "--control-a", "human",
                    "--bot-b", os.path.join("engine", "bot_sample_2.py"),
                    "--config", config_path,
                    "--out", out_path,
                    "--human-turn-ms", "2000",
                    "--stream",
                ],
                cwd=REPO_ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )

            try:
                human_turns = 0
                for line in child.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    event = json.loads(line)
                    if event.get("type") != "TURN_REQUEST":
                        continue
                    human_turns += 1
                    child.stdin.write(json.dumps({
                        "type": "TURN_RESPONSE",
                        "request_id": event["request_id"],
                        "action": pick_legal_move(event["payload"]),
                    }) + "\n")
                    child.stdin.flush()
            finally:
                stderr = child.stderr.read()
                child.stdout.close()
                child.stderr.close()
                child.stdin.close()

            self.assertEqual(child.wait(timeout=30), 0, stderr)
            self.assertGreater(human_turns, 0, "engine phải hỏi lượt đội A qua stdout")

            with open(out_path, encoding="utf-8") as handle:
                replay = json.load(handle)
            self.assertEqual(replay["controls"], {"team_a": "human", "team_b": "bot"})
            self.assertNotIn(replay["match_info"]["win_reason"], ("ILLEGAL_MOVE", "BOT_LOAD_ERROR"))
            self.assertGreaterEqual(len(replay["turns"]), 4, "bot đội B vẫn phải chơi tiếp nhiều lượt")
            team_a_turns = [t for t in replay["turns"] if t["player"] == "team_a"]
            self.assertTrue(all(t["actions"] for t in team_a_turns), "nước đi của người phải được ghi")


if __name__ == "__main__":
    unittest.main()
