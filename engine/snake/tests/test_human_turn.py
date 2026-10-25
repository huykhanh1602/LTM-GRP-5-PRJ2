"""Chạy thật match_runner.py với một đội do người thật (stdin/stdout) điều khiển."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DIR_OFFSETS = {"UP": (0, -1), "DOWN": (0, 1), "LEFT": (-1, 0), "RIGHT": (1, 0)}


def pick_legal_direction(payload):
    """Chọn một hướng còn hợp lệ, giống cách giao diện tô sáng ô cho người chơi."""
    board = payload["board_state"]
    mine = payload["my_pieces"]
    theirs = payload["opponent_pieces"]
    head_x, head_y = mine[0]["pos"]
    blocked = {tuple(p["pos"]) for p in mine[:-1]} | {tuple(p["pos"]) for p in theirs}
    for direction, (dx, dy) in DIR_OFFSETS.items():
        nx, ny = head_x + dx, head_y + dy
        if 0 <= nx < board["width"] and 0 <= ny < board["height"] and (nx, ny) not in blocked:
            return direction
    return "UP"


class SnakeHumanControlTests(unittest.TestCase):
    def test_doi_a_di_bang_chuot_doi_b_van_chay_bot(self):
        with tempfile.TemporaryDirectory() as workdir:
            config_path = os.path.join(workdir, "config.json")
            out_path = os.path.join(workdir, "replay.json")
            with open(os.path.join(REPO_ROOT, "engine", "snake", "config.json"), encoding="utf-8") as handle:
                config = json.load(handle)
            config["seed"] = 7
            config["limits"]["max_turns"] = 6
            with open(config_path, "w", encoding="utf-8") as handle:
                json.dump(config, handle)

            child = subprocess.Popen(
                [
                    sys.executable, os.path.join("engine", "snake", "match_runner.py"),
                    "--control-a", "human",
                    "--bot-b", os.path.join("engine", "snake", "bot_sample_random.py"),
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
                    direction = pick_legal_direction(event["payload"])
                    child.stdin.write(json.dumps({
                        "type": "TURN_RESPONSE",
                        "request_id": event["request_id"],
                        "action": {"action_type": "MOVE", "direction": direction},
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
            # Bot đội B vẫn phải chơi đủ số lượt: khởi động bot không được chậm vì kênh lượt người.
            self.assertEqual(replay["match_info"]["total_turns"], 6)
            failed = [t for t in replay["turns"] if any(e["type"] == "BOT_FAILED" for e in t["events"])]
            self.assertEqual(failed, [], "không đội nào được phép lỗi nạp bot")
            self.assertNotIn(replay["match_info"]["win_reason"], ("BOT_TIMEOUT", "ILLEGAL_MOVE", "BOT_LOAD_ERROR"))
            team_a_turns = [t for t in replay["turns"] if t["player"] == "team_a"]
            self.assertTrue(all(t["actions"] for t in team_a_turns), "nước đi của người phải được ghi")


if __name__ == "__main__":
    unittest.main()
