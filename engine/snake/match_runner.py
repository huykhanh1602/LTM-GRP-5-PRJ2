"""Runner chạy trận đấu Snake Bot và phát sự kiện NDJSON qua WebSocket."""

from __future__ import annotations

import argparse
import json
import os
import sys

def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

# Đảm bảo import được BotProcess từ game_engine chính của dự án
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from game_engine import TEAM_A, TEAM_B, create_player, normalize_control
from snake_engine import SnakeEngine


def _resolve_path(path: str, base_dir: str) -> str:
    if os.path.isabs(path):
        return path
    cwd_candidate = os.path.abspath(path)
    if os.path.exists(cwd_candidate):
        return cwd_candidate
    script_candidate = os.path.abspath(os.path.join(base_dir, path))
    if os.path.exists(script_candidate):
        return script_candidate
    has_dir = os.path.dirname(path) not in ("", ".")
    return cwd_candidate if has_dir else script_candidate


def main(argv=None) -> int:
    _configure_stdio()
    parser = argparse.ArgumentParser(description="Runner trận đấu Rắn Săn Mồi (Snake Bot)")
    parser.add_argument("--bot-a", default="bot_sample_greedy.py")
    parser.add_argument("--bot-b", default="bot_sample_random.py")
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--out", default="replay.json")
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Phát sự kiện match_start, turn, match_end dưới dạng NDJSON.",
    )
    parser.add_argument(
        "--control-a",
        choices=("bot", "human"),
        default="bot",
        help="Đội A do bot chạy file hay người thật cầm chuột (mặc định: bot).",
    )
    parser.add_argument(
        "--control-b",
        choices=("bot", "human"),
        default="bot",
        help="Đội B do bot chạy file hay người thật cầm chuột (mặc định: bot).",
    )
    parser.add_argument(
        "--human-turn-ms",
        type=int,
        default=30_000,
        help="Giây (ms) một lượt của người chơi cầm chuột được chờ (mặc định: 30000).",
    )
    args = parser.parse_args(argv)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = _resolve_path(args.config, base_dir)
    bot_a_path = _resolve_path(args.bot_a, base_dir)
    bot_b_path = _resolve_path(args.bot_b, base_dir)
    out_path = _resolve_path(args.out, base_dir)

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    bot_time_ms = int(config.get("limits", {}).get("bot_time_ms", 1000))
    player_state: dict = {}
    bot_a = create_player(
        args.control_a, TEAM_A, bot_a_path, bot_time_ms, args.human_turn_ms, player_state
    )
    bot_b = create_player(
        args.control_b, TEAM_B, bot_b_path, bot_time_ms, args.human_turn_ms, player_state
    )
    controls = {TEAM_A: normalize_control(args.control_a), TEAM_B: normalize_control(args.control_b)}

    try:
        engine = SnakeEngine(config, {TEAM_A: bot_a, TEAM_B: bot_b})
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

    replay["controls"] = controls
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(replay, f, ensure_ascii=False, indent=2)

    return 0


if __name__ == "__main__":
    sys.exit(main())
