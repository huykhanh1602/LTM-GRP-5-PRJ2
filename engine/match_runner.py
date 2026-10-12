"""Script chính chạy một trận đấu giữa hai bot và xuất ``replay.json``.

Cách dùng::

    python match_runner.py
    python match_runner.py --bot-a bot_sample_1.py --bot-b bot_sample_2.py \
        --config config.json --out replay.json

* Mặc định nạp ``bot_sample_1.py`` (đội A) và ``bot_sample_2.py`` (đội B).
* Đường dẫn tương đối được tìm theo: thư mục đang làm việc, sau đó tới
  thư mục chứa script này.

Script phải được bảo vệ bằng ``if __name__ == "__main__"`` vì bot chạy trong
tiến trình ``multiprocessing`` (spawn) - điều kiện bắt buộc trên Windows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from game_engine import (
    TEAM_A,
    TEAM_B,
    BotProcess,
    GameConfig,
    GameEngine,
    ReplayExporter,
)


def _configure_stdio() -> None:
    """Ép stdout/stderr sang UTF-8 để in tiếng Việt an toàn trên Windows."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass


def _resolve_path(path: str, base_dir: str) -> str:
    """Tìm đường dẫn đầu vào/đầu ra một cách linh hoạt.

    Thứ tự ưu tiên:
    1. Đường dẫn tuyệt đối -> giữ nguyên.
    2. File đã tồn tại so với thư mục hiện hành -> dùng luôn.
    3. File đã tồn tại so với thư mục script -> dùng đường dẫn đó.
    4. File chưa tồn tại (thường là file đầu ra): nếu người dùng có ghi rõ
       thư mục (ví dụ ``engine/replay.json``) thì tính theo thư mục hiện hành,
       ngược lại (chỉ tên file, ví dụ ``replay.json``) thì đặt cạnh script.
    """
    if os.path.isabs(path):
        return path

    cwd_candidate = os.path.abspath(path)
    if os.path.exists(cwd_candidate):
        return cwd_candidate

    script_candidate = os.path.abspath(os.path.join(base_dir, path))
    if os.path.exists(script_candidate):
        return script_candidate

    has_directory = os.path.dirname(path) not in ("", ".")
    return cwd_candidate if has_directory else script_candidate


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Chạy trận đấu 'Oẳn Tù Tì Trên Bàn Cờ' giữa hai bot."
    )
    parser.add_argument(
        "--bot-a",
        default="bot_sample_1.py",
        help="Đường dẫn file bot đội A (mặc định: bot_sample_1.py).",
    )
    parser.add_argument(
        "--bot-b",
        default="bot_sample_2.py",
        help="Đường dẫn file bot đội B (mặc định: bot_sample_2.py).",
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Đường dẫn file cấu hình (mặc định: config.json).",
    )
    parser.add_argument(
        "--out",
        default="replay.json",
        help="Đường dẫn file replay đầu ra (mặc định: replay.json).",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Phát sự kiện match_start, turn, match_end dưới dạng NDJSON.",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    _configure_stdio()
    args = parse_args(argv)
    base_dir = os.path.dirname(os.path.abspath(__file__))

    config_path = _resolve_path(args.config, base_dir)
    bot_a_path = _resolve_path(args.bot_a, base_dir)
    bot_b_path = _resolve_path(args.bot_b, base_dir)
    out_path = _resolve_path(args.out, base_dir)

    config = GameConfig.load(config_path)

    bot_a = BotProcess(bot_a_path, TEAM_A, config.bot_time_ms)
    bot_b = BotProcess(bot_b_path, TEAM_B, config.bot_time_ms)

    try:
        engine = GameEngine(config, {TEAM_A: bot_a, TEAM_B: bot_b})
        on_event = None
        if args.stream:
            on_event = lambda event: print(
                json.dumps(event, ensure_ascii=False, separators=(",", ":")),
                flush=True,
            )
        replay = engine.run(on_event=on_event)
    finally:
        bot_a.close()
        bot_b.close()

    written_path = ReplayExporter.write(replay, out_path)

    info = replay["match_info"]
    output = sys.stderr if args.stream else sys.stdout
    print("=" * 60, file=output)
    print("KẾT QUẢ TRẬN ĐẤU", file=output)
    print("=" * 60, file=output)
    print(f"Trận:        {info['match_id']}", file=output)
    print(f"Đội A:       {config.teams.get(TEAM_A)}", file=output)
    print(f"Đội B:       {config.teams.get(TEAM_B)}", file=output)
    print(f"Tổng lượt:   {info['total_turns']}", file=output)
    if info["winner"] is None:
        print("Kết quả:     HÒA", file=output)
    else:
        print(f"Đội thắng:   {info['winner']} ({config.teams.get(info['winner'])})", file=output)
    print(f"Lý do:       {info['win_reason']}", file=output)
    print(f"Replay:      {written_path}", file=output)
    print("=" * 60, file=output)

    return 0


if __name__ == "__main__":
    sys.exit(main())
