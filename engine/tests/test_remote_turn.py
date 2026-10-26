"""Điều khiển trận bằng chuột: engine hỏi lượt qua stdout, Node trả lời qua stdin."""

import json
import queue
import threading
import time
import unittest

from engine import game_engine
from engine.game_engine import (
    STATUS_OK,
    STATUS_TIMEOUT,
    TEAM_A,
    TEAM_B,
    RemoteTurnBridge,
    normalize_control,
)


class StringWriter:
    """Thay cho stdout: ghi lại từng dòng NDJSON engine gửi ra ngoài."""

    def __init__(self):
        self.lines = []

    def write(self, text):
        self.lines.append(text)
        return len(text)

    def flush(self):
        return None

    def wait_for(self, count):
        deadline = time.monotonic() + 1.0
        while len(self.lines) < count:
            if time.monotonic() > deadline:
                raise AssertionError("Engine không gửi đủ yêu cầu lượt.")
            time.sleep(0.01)
        return [json.loads(line) for line in self.lines]

    def last_request(self):
        return json.loads(self.lines[-1])


def response_for(request_id, direction):
    return json.dumps({
        "type": "TURN_RESPONSE",
        "request_id": request_id,
        "action": {"action_type": "MOVE", "direction": direction},
    })


class RemoteTurnBridgeTests(unittest.TestCase):
    def setUp(self):
        self.writer = StringWriter()
        self.bridge = RemoteTurnBridge(writer=self.writer)
        self._grace = game_engine.REMOTE_GRACE_SECONDS
        game_engine.REMOTE_GRACE_SECONDS = 0.05

    def tearDown(self):
        game_engine.REMOTE_GRACE_SECONDS = self._grace

    def ask_async(self, team, payload, timeout_ms):
        """Gọi bridge.request ở thread riêng để test còn rảnh tay trả lời."""
        results = queue.Queue()
        thread = threading.Thread(
            target=lambda: results.put(self.bridge.request(team, payload, timeout_ms)),
            daemon=True,
        )
        thread.start()
        return results

    def test_nuoc_di_tra_loi_duoc_giao_dung_luot(self):
        results = self.ask_async(TEAM_A, {"turn": 1}, 1000)
        request = self.writer.wait_for(1)[0]
        self.assertEqual(request["type"], "TURN_REQUEST")
        self.assertEqual(request["team"], TEAM_A)
        self.assertEqual(request["deadline_ms"], 1000)

        self.bridge.dispatch(response_for(-99, "UP"))          # id lạ: phải bị bỏ qua
        self.bridge.dispatch(response_for(request["request_id"], "RIGHT"))

        answer = results.get(timeout=1.0)
        self.assertEqual(answer["status"], STATUS_OK)
        self.assertEqual(answer["action"]["direction"], "RIGHT")

    def test_khong_ai_tra_loi_thi_thanh_timeout(self):
        results = self.ask_async(TEAM_B, {"turn": 3}, 10)
        answer = results.get(timeout=1.0)
        self.assertEqual(answer["status"], STATUS_TIMEOUT)
        self.assertEqual(answer["request_id"], self.writer.last_request()["request_id"])

    def test_hai_doi_cung_cam_chuot_tra_loi_ngay_loi_thu_tu_khoan(self):
        first = self.ask_async(TEAM_A, {"turn": 1}, 1000)
        second = self.ask_async(TEAM_B, {"turn": 1}, 1000)
        requests = self.writer.wait_for(2)

        # Trả lời ngược thứ tự: đội đến sau được đáp trước.
        self.bridge.dispatch(response_for(requests[1]["request_id"], "DOWN"))
        self.bridge.dispatch(response_for(requests[0]["request_id"], "LEFT"))

        self.assertEqual(first.get(timeout=1.0)["action"]["direction"], "LEFT")
        self.assertEqual(second.get(timeout=1.0)["action"]["direction"], "DOWN")
        self.assertEqual({r["team"] for r in requests}, {TEAM_A, TEAM_B})

    def test_chuan_hoa_che_do_dieu_khien(self):
        self.assertEqual(normalize_control("human"), "human")
        self.assertEqual(normalize_control("CHUOT"), "human")
        self.assertEqual(normalize_control(None), "bot")
        with self.assertRaises(ValueError):
            normalize_control("keyboard")


if __name__ == "__main__":
    unittest.main()
