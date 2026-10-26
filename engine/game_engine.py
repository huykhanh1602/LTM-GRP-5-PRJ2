"""Game Engine cho giải đấu "Oẳn Tù Tì Trên Bàn Cờ" (Board-based Rock-Paper-Scissors).

Module này chứa toàn bộ luật chơi, trạng thái bàn cờ, xử lý va chạm,
cô lập tiến trình bot (timeout/crash) và xuất file ``replay.json``.

Quy ước hệ tọa độ
-----------------
* Tọa độ ``[x, y] = [cột, hàng]``.
* Gốc ``(0, 0)`` nằm ở góc TOP-LEFT.
* ``x`` tăng từ trái sang phải, ``y`` tăng từ trên xuống dưới.

Thành phần chính
----------------
* :class:`GameConfig`   - nạp và kiểm tra ``config.json``.
* :class:`Piece`        - một quân cờ (ROCK/PAPER/SCISSORS).
* :class:`Board`        - bàn cờ, ô đặc biệt (BASE/OBSTACLE/TRAP).
* :class:`CombatResolver` - quy tắc "oẳn tù tì" khi va chạm.
* :class:`BotProcess`   - chạy bot trong tiến trình riêng, chặn timeout/crash.
* :class:`GameEngine`   - vòng lặp lượt đi và sinh dữ liệu replay.
* :class:`ReplayExporter` - ghi ``replay.json``.
"""

from __future__ import annotations

import importlib.util
import json
import multiprocessing
import os
import queue as queue_module
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# Hằng số
# ---------------------------------------------------------------------------

PIECE_TYPES = ("ROCK", "PAPER", "SCISSORS")

TEAM_A = "team_a"
TEAM_B = "team_b"
TEAMS = (TEAM_A, TEAM_B)

TILE_BASE = "BASE"
TILE_OBSTACLE = "OBSTACLE"
TILE_TRAP = "TRAP"

ACTION_MOVE = "MOVE"

STATUS_OK = "ok"
STATUS_TIMEOUT = "timeout"
STATUS_ERROR = "error"
STATUS_LOAD_ERROR = "load_error"

# Cách một đội điều khiển quân cờ trong ván.
CONTROL_BOT = "bot"
CONTROL_HUMAN = "human"

# Tin nhắn khởi động: bot đã nạp xong, chưa phải kết quả lượt đi.
BOT_READY_KEY = "__bot_ready__"
BOOT_TIMEOUT_MS_DEFAULT = 5000

# Lý do kết thúc trận đấu
REASON_BASE_CAPTURED = "BASE_CAPTURED"
REASON_ALL_PIECES_CAPTURED = "ALL_PIECES_CAPTURED"
REASON_OPPONENT_TIMEOUT = "OPPONENT_TIMEOUT"
REASON_OPPONENT_CRASH = "OPPONENT_CRASH"
REASON_MAX_TURNS = "MAX_TURNS_PIECE_COUNT"
REASON_DRAW = "DRAW"

# Quy tắc va chạm cùng loại quân
SAME_TYPE_BOTH_DESTROYED = "BOTH_DESTROYED"
SAME_TYPE_ATTACKER_DIES = "ATTACKER_DIES"
SAME_TYPE_DEFENDER_DIES = "DEFENDER_DIES"

# Hiệu ứng bẫy
TRAP_EFFECT_DESTROYED = "DESTROYED"

# 8 hướng di chuyển (bao gồm chéo) - mỗi bước đi đúng 1 ô.
_DIRECTIONS_8: Tuple[Tuple[int, int], ...] = (
    (-1, -1), (0, -1), (1, -1),
    (-1, 0), (1, 0),
    (-1, 1), (0, 1), (1, 1),
)


# ---------------------------------------------------------------------------
# Hàm tiện ích
# ---------------------------------------------------------------------------


def _is_int(value: Any) -> bool:
    """True nếu ``value`` là số nguyên (loại trừ ``bool``)."""
    return isinstance(value, int) and not isinstance(value, bool)


def _is_cell(value: Any) -> bool:
    """Kiểm tra một ô cờ dạng ``[x, y]`` với hai số nguyên không âm."""
    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and _is_int(value[0])
        and _is_int(value[1])
        and value[0] >= 0
        and value[1] >= 0
    )


def _as_pos(value: Any) -> Tuple[int, int]:
    """Chuyển ``[x, y]`` (list/tuple) thành tuple ``(x, y)``."""
    return (int(value[0]), int(value[1]))


# ---------------------------------------------------------------------------
# Cấu hình trận đấu
# ---------------------------------------------------------------------------


class GameConfig:
    """Bọc quanh dict ``config.json`` và kiểm tra tính hợp lệ cơ bản."""

    def __init__(self, raw: Dict[str, Any]) -> None:
        if not isinstance(raw, dict):
            raise ValueError("config phải là một object JSON.")
        self.raw = raw
        self._validate()
        self._parse()

    # -- Nạp từ file --------------------------------------------------------

    @classmethod
    def load(cls, path: str) -> "GameConfig":
        """Đọc ``config.json`` từ đĩa và trả về :class:`GameConfig`."""
        with open(path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return cls(raw)

    # -- Kiểm tra -----------------------------------------------------------

    def _validate(self) -> None:
        raw = self.raw

        board = raw.get("board")
        if not isinstance(board, dict):
            raise ValueError("config.board phải là một object.")
        if not _is_int(board.get("width")) or board["width"] <= 0:
            raise ValueError("config.board.width phải là số nguyên dương.")
        if not _is_int(board.get("height")) or board["height"] <= 0:
            raise ValueError("config.board.height phải là số nguyên dương.")

        spec = board.get("special_tiles", [])
        if not isinstance(spec, list):
            raise ValueError("config.board.special_tiles phải là danh sách.")
        for tile in spec:
            if not isinstance(tile, dict):
                raise ValueError("Mỗi special_tile phải là một object.")
            if tile.get("type") not in (TILE_BASE, TILE_OBSTACLE, TILE_TRAP):
                raise ValueError(
                    "special_tile.type phải là BASE, OBSTACLE hoặc TRAP."
                )
            if not _is_cell(tile.get("pos")):
                raise ValueError("special_tile.pos phải có dạng [x, y].")
            if tile["type"] == TILE_BASE and tile.get("owner") not in TEAMS:
                raise ValueError(
                    "special_tile BASE phải có owner là team_a hoặc team_b."
                )

        initial = raw.get("initial_state", [])
        if not isinstance(initial, list):
            raise ValueError("config.initial_state phải là danh sách.")
        for piece in initial:
            if not isinstance(piece, dict):
                raise ValueError("Mỗi quân cờ ban đầu phải là một object.")
            if not isinstance(piece.get("id"), str) or not piece["id"]:
                raise ValueError("Quân cờ phải có id dạng chuỗi không rỗng.")
            if piece.get("owner") not in TEAMS:
                raise ValueError("Quân cờ phải có owner là team_a hoặc team_b.")
            if piece.get("type") not in PIECE_TYPES:
                raise ValueError(
                    "Quân cờ phải có type là ROCK, PAPER hoặc SCISSORS."
                )
            if not _is_cell(piece.get("pos")):
                raise ValueError("Quân cờ phải có pos dạng [x, y].")

    def _parse(self) -> None:
        raw = self.raw
        board = raw["board"]

        self.width = int(board["width"])
        self.height = int(board["height"])
        self.coordinate_system = board.get(
            "coordinate_system", "TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN"
        )
        self.special_tiles: List[Dict[str, Any]] = list(board.get("special_tiles", []))

        rules = raw.get("rules", {}) or {}
        self.movement = rules.get("movement", "KING_8_DIR_1_STEP")
        self.allow_diagonal = bool(rules.get("allow_diagonal", True))
        self.same_type_rule = rules.get(
            "same_type_collision", SAME_TYPE_BOTH_DESTROYED
        )
        self.trap_effect = rules.get("trap_effect", TRAP_EFFECT_DESTROYED)
        self.combat_map = rules.get(
            "combat",
            {"ROCK": "SCISSORS", "SCISSORS": "PAPER", "PAPER": "ROCK"},
        )

        limits = raw.get("limits", {}) or {}
        self.max_turns = int(limits.get("max_turns", 100))
        self.turn_mode = limits.get("turn_mode", "ALTERNATING")
        self.bot_time_ms = int(limits.get("bot_time_ms", 1000))
        self.max_timeouts = int(limits.get("max_timeouts", 3))
        self.max_errors = int(limits.get("max_errors", 3))
        self.starting_team = limits.get("starting_team", TEAM_A)
        if self.starting_team not in TEAMS:
            self.starting_team = TEAM_A

        match = raw.get("match", {}) or {}
        self.match_id = match.get("match_id", "M_LOCAL_RPS")
        self.teams = match.get(
            "teams", {TEAM_A: "Bot_Alpha", TEAM_B: "Bot_Beta"}
        )

        self.initial_pieces: List[Dict[str, Any]] = list(raw.get("initial_state", []))

    # -- Xuất lại phần cấu hình cho replay ----------------------------------

    def to_replay_config(self) -> Dict[str, Any]:
        """Trả về phần ``game_config`` đúng định dạng replay.json."""
        return {
            "board": {
                "width": self.width,
                "height": self.height,
                "coordinate_system": self.coordinate_system,
                "special_tiles": self.special_tiles,
            },
            "max_turns": self.max_turns,
            "turn_mode": self.turn_mode,
            "rules": {
                "movement": self.movement,
                "same_type_collision": self.same_type_rule,
                "trap_effect": self.trap_effect,
                "allow_diagonal": self.allow_diagonal,
                "combat": self.combat_map,
            },
            "limits": {
                "bot_time_ms": self.bot_time_ms,
                "max_timeouts": self.max_timeouts,
                "max_errors": self.max_errors,
                "starting_team": self.starting_team,
            },
        }


# ---------------------------------------------------------------------------
# Quân cờ
# ---------------------------------------------------------------------------


@dataclass
class Piece:
    """Một quân cờ trên bàn."""

    id: str
    owner: str
    type: str
    pos: Tuple[int, int]
    hp: int = 1
    alive: bool = True

    def to_state(self) -> Dict[str, Any]:
        """Biểu diễn quân cờ dưới dạng dict JSON."""
        return {
            "id": self.id,
            "owner": self.owner,
            "type": self.type,
            "pos": [self.pos[0], self.pos[1]],
            "hp": self.hp,
        }


# ---------------------------------------------------------------------------
# Bàn cờ
# ---------------------------------------------------------------------------


class Board:
    """Trạng thái tĩnh của bàn cờ: kích thước và các ô đặc biệt."""

    def __init__(
        self,
        width: int,
        height: int,
        special_tiles: Sequence[Dict[str, Any]],
    ) -> None:
        self.width = width
        self.height = height
        self.tiles: Dict[Tuple[int, int], Dict[str, Any]] = {}
        self.obstacles: set = set()
        self.traps: set = set()
        self.bases: Dict[str, Tuple[int, int]] = {}

        for tile in special_tiles:
            pos = _as_pos(tile["pos"])
            self.tiles[pos] = tile
            tile_type = tile["type"]
            if tile_type == TILE_OBSTACLE:
                self.obstacles.add(pos)
            elif tile_type == TILE_TRAP:
                self.traps.add(pos)
            elif tile_type == TILE_BASE:
                self.bases[tile["owner"]] = pos

    def in_bounds(self, x: int, y: int) -> bool:
        """True nếu ``(x, y)`` nằm trong bàn cờ."""
        return 0 <= x < self.width and 0 <= y < self.height

    def is_obstacle(self, x: int, y: int) -> bool:
        """True nếu ô là chướng ngại vật."""
        return (x, y) in self.obstacles

    def is_trap(self, x: int, y: int) -> bool:
        """True nếu ô là bẫy."""
        return (x, y) in self.traps

    def base_owner(self, x: int, y: int) -> Optional[str]:
        """Trả về chủ sở hữu ô Thành tại ``(x, y)`` hoặc ``None``."""
        for owner, pos in self.bases.items():
            if pos == (x, y):
                return owner
        return None

    def base_pos(self, owner: str) -> Optional[Tuple[int, int]]:
        """Trả về tọa độ ô Thành của ``owner``."""
        return self.bases.get(owner)


# ---------------------------------------------------------------------------
# Xử lý va chạm (oẳn tù tì)
# ---------------------------------------------------------------------------


class CombatResolver:
    """Quyết định thắng/thua khi hai quân cờ va chạm."""

    def __init__(self, combat_map: Dict[str, str], same_type_rule: str) -> None:
        self.combat_map = combat_map
        self.same_type_rule = same_type_rule

    def beats(self, attacker_type: str, defender_type: str) -> bool:
        """True nếu ``attacker_type`` khắc chế ``defender_type``."""
        return self.combat_map.get(attacker_type) == defender_type

    def resolve(self, attacker_type: str, defender_type: str) -> Tuple[bool, bool]:
        """Trả về ``(attacker_loses, defender_loses)``."""
        if attacker_type == defender_type:
            if self.same_type_rule == SAME_TYPE_ATTACKER_DIES:
                return True, False
            if self.same_type_rule == SAME_TYPE_DEFENDER_DIES:
                return False, True
            # Mặc định: cả hai cùng bị hủy.
            return True, True

        if self.beats(attacker_type, defender_type):
            return False, True
        return True, False


# ---------------------------------------------------------------------------
# Nạp bot động
# ---------------------------------------------------------------------------


def _load_module_from_path(path: str, module_name: str) -> Any:
    """Nạp một module Python từ đường dẫn file cụ thể."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Không tìm thấy file bot: {path}")

    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Không thể tạo spec cho module: {path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bot_worker_entry(
    bot_path: str,
    task_queue: Any,
    result_queue: Any,
) -> None:
    """Tiến trình con chạy bot và trả kết quả qua ``result_queue``.

    Hàm này phải ở cấp module để ``multiprocessing`` (spawn) có thể pickle.
    """
    sys.stdout = sys.stderr
    make_move = None
    load_error = None

    try:
        module = _load_module_from_path(bot_path, "bot_worker_module")
        make_move = getattr(module, "make_move", None)
        if not callable(make_move):
            raise AttributeError("Bot thiếu hàm make_move() có thể gọi được.")
    except BaseException as exc:  # noqa: BLE001 - muốn bắt mọi lỗi nạp bot
        make_move = None
        load_error = f"{type(exc).__name__}: {exc}"

    # Báo sẵn sàng trước vòng lặp: engine chờ tin này lúc khởi động,
    # nhờ chi phí spawn + import bot không bị tính vào đồng hồ lượt 1.
    try:
        result_queue.put({BOT_READY_KEY: True, "error": load_error})
    except Exception:  # noqa: BLE001
        return

    while True:
        try:
            task = task_queue.get()
        except (EOFError, OSError):
            return

        if task is None:
            return

        if make_move is None:
            result_queue.put({"status": STATUS_LOAD_ERROR, "error": load_error})
            continue

        try:
            action = make_move(
                task["board_state"],
                task["my_pieces"],
                task["opponent_pieces"],
                task["config"],
            )
        except BaseException as exc:  # noqa: BLE001 - muốn bắt mọi crash của bot
            result_queue.put(
                {"status": STATUS_ERROR, "error": f"{type(exc).__name__}: {exc}"}
            )
            continue

        try:
            result_queue.put({"status": STATUS_OK, "action": action})
        except Exception as exc:  # noqa: BLE001
            result_queue.put(
                {"status": STATUS_ERROR, "error": f"UNPICKLABLE_ACTION: {exc}"}
            )


class BotProcess:
    """Chạy một bot trong tiến trình riêng để cô lập timeout và crash.

    * Mỗi lượt engine gọi :meth:`request`.
    * Nếu bot treo quá ``timeout_ms`` -> tiến trình bị kill và tạo lại.
    * Nếu bot crash -> lỗi được bắt và trả về dưới dạng ``status="error"``.
    """

    def __init__(
        self,
        bot_path: str,
        team_id: str,
        timeout_ms: int,
        boot_timeout_ms: Optional[int] = None,
    ) -> None:
        self.bot_path = os.path.abspath(bot_path)
        self.team_id = team_id
        self.timeout_ms = int(timeout_ms)
        self.boot_timeout_ms = int(boot_timeout_ms or BOOT_TIMEOUT_MS_DEFAULT)
        self._ctx = multiprocessing.get_context("spawn")
        self._task_queue = None
        self._result_queue = None
        self._process = None
        self._boot_error = None
        self._start_worker()

    # -- Vòng đời tiến trình ------------------------------------------------

    def _start_worker(self) -> None:
        self._task_queue = self._ctx.Queue()
        self._result_queue = self._ctx.Queue()
        self._process = self._ctx.Process(
            target=_bot_worker_entry,
            args=(self.bot_path, self._task_queue, self._result_queue),
            daemon=True,
        )
        self._process.start()
        self._wait_until_ready()

    def _wait_until_ready(self) -> None:
        """Chờ bot nạp xong (spawn + import) trước khi trận bắt đầu đếm giờ."""
        self._boot_error = None
        try:
            ready = self._result_queue.get(timeout=self.boot_timeout_ms / 1000.0)
        except queue_module.Empty:
            self._boot_error = (
                f"Bot không khởi động xong trong {self.boot_timeout_ms}ms."
            )
            return
        except Exception as exc:  # noqa: BLE001
            self._boot_error = f"QUEUE_HANDSHAKE_FAILED: {exc}"
            return

        if not (isinstance(ready, dict) and ready.get(BOT_READY_KEY)):
            self._boot_error = f"Bot gửi tin nhắn khởi động lạ: {ready!r}"
            return
        if ready.get("error"):
            self._boot_error = str(ready["error"])

    def _terminate_worker(self) -> None:
        process = self._process
        try:
            if process is not None and process.is_alive():
                process.terminate()
        except Exception:  # noqa: BLE001
            pass

        if process is not None:
            try:
                process.join(timeout=1.0)
            except Exception:  # noqa: BLE001
                pass

        for q in (self._task_queue, self._result_queue):
            try:
                if q is not None:
                    q.cancel_join_thread()
                    q.close()
            except Exception:  # noqa: BLE001
                pass

        self._process = None
        self._task_queue = None
        self._result_queue = None

    def _restart_worker(self) -> None:
        self._terminate_worker()
        self._start_worker()

    # -- Giao tiếp ----------------------------------------------------------

    def request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Gửi trạng thái cho bot và nhận kết quả, có giới hạn thời gian."""
        if self._process is None or not self._process.is_alive():
            self._restart_worker()

        # Bot không nạp được (lỗi import hoặc treo lúc khởi động): báo ngay,
        # để đồng hồ lượt đấu không bị tính cho phần khởi động.
        if self._boot_error is not None:
            return {"status": STATUS_LOAD_ERROR, "error": self._boot_error}

        try:
            self._task_queue.put(payload)
        except Exception as exc:  # noqa: BLE001
            self._restart_worker()
            return {"status": STATUS_ERROR, "error": f"QUEUE_WRITE_FAILED: {exc}"}

        try:
            return self._result_queue.get(timeout=self.timeout_ms / 1000.0)
        except queue_module.Empty:
            # Bot treo -> kill tiến trình và tạo lại cho lượt sau.
            self._restart_worker()
            return {"status": STATUS_TIMEOUT}
        except Exception as exc:  # noqa: BLE001
            self._restart_worker()
            return {"status": STATUS_ERROR, "error": f"QUEUE_READ_FAILED: {exc}"}

    def close(self) -> None:
        """Dừng tiến trình bot và giải phóng tài nguyên."""
        try:
            if self._task_queue is not None:
                self._task_queue.put(None)
        except Exception:  # noqa: BLE001
            pass
        self._terminate_worker()


# ---------------------------------------------------------------------------
# Người chơi cầm chuột: engine hỏi lượt, tiến trình quản lý (Node) trả lời
# ---------------------------------------------------------------------------


HUMAN_TURN_TIMEOUT_MS_DEFAULT = 30_000
REMOTE_GRACE_SECONDS = 5.0


class RemoteTurnBridge:
    """Kênh NDJSON hai chiều giữa engine và Node cho các lượt của người thật.

    Chỉ một luồng đọc stdin cho toàn bộ trận, phản hồi được tra theo
    ``request_id`` nên cả hai đội đều có thể do người điều khiển.
    """

    def __init__(self, writer: Any = None) -> None:
        self._writer = writer if writer is not None else sys.stdout
        self._write_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._waiters: Dict[int, Any] = {}
        self._next_request_id = 0
        self._reader: Any = None

    def _start_reader(self) -> None:
        """Chỉ đọc stdin khi thực sự có lượt người, tránh chặn spawn của bot lúc khởi động."""
        with self._state_lock:
            if self._reader is not None:
                return
            self._reader = threading.Thread(target=self._read_stdin, daemon=True)
        self._reader.start()

    def _read_stdin(self) -> None:
        while True:
            try:
                line = sys.stdin.readline()
            except (ValueError, OSError):
                return
            if not line:
                return
            self.dispatch(line)

    def dispatch(self, raw: str) -> None:
        """Nạp một dòng JSON từ stdin và giao cho lượt đang chờ đúng id."""
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return
        if not isinstance(message, dict) or message.get("type") != "TURN_RESPONSE":
            return
        request_id = message.get("request_id")
        with self._state_lock:
            waiter = self._waiters.get(request_id) if isinstance(request_id, int) else None
        if waiter is not None:
            waiter.put(message)

    def send(self, message: Dict[str, Any]) -> bool:
        try:
            text = json.dumps(message, ensure_ascii=False, separators=(",", ":"), default=str)
        except (TypeError, ValueError):
            return False
        try:
            with self._write_lock:
                self._writer.write(text + "\n")
                self._writer.flush()
            return True
        except (BrokenPipeError, ValueError):
            return False

    def request(
        self,
        team_id: str,
        payload: Dict[str, Any],
        timeout_ms: int,
    ) -> Dict[str, Any]:
        """Hỏi một lượt rồi chờ Node trả lời; quá hạn thì trả status timeout."""
        self._start_reader()
        with self._state_lock:
            self._next_request_id += 1
            request_id = self._next_request_id
            waiter: queue_module.Queue = queue_module.Queue()
            self._waiters[request_id] = waiter

        try:
            if not self.send({
                "type": "TURN_REQUEST",
                "request_id": request_id,
                "team": team_id,
                "deadline_ms": int(timeout_ms),
                "payload": payload,
            }):
                return {"status": STATUS_ERROR, "error": "ENGINE_PIPE_CLOSED"}

            # Node tự gửi nước đi dự phòng khi người chơi AFK; engine chỉ chờ
            # thêm đệm để không bao giờ treo trận.
            deadline = time.monotonic() + (timeout_ms / 1000.0) + REMOTE_GRACE_SECONDS
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return {"status": STATUS_TIMEOUT, "request_id": request_id}
                try:
                    message = waiter.get(timeout=min(0.25, remaining))
                except queue_module.Empty:
                    continue
                action = message.get("action")
                if action is None:
                    return {
                        "status": STATUS_ERROR,
                        "error": str(message.get("error") or "MISSING_ACTION"),
                    }
                return {"status": STATUS_OK, "action": action}
        finally:
            with self._state_lock:
                self._waiters.pop(request_id, None)


class RemoteHumanAdapter:
    """Adapter phía người thật, cùng hợp đồng request/close với BotProcess."""

    def __init__(
        self,
        team_id: str,
        bridge: RemoteTurnBridge,
        timeout_ms: int = HUMAN_TURN_TIMEOUT_MS_DEFAULT,
    ) -> None:
        self.team_id = team_id
        self.bridge = bridge
        self.timeout_ms = int(timeout_ms)

    def request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self.bridge.request(self.team_id, payload, self.timeout_ms)

    def close(self) -> None:
        return None


def normalize_control(spec: str) -> str:
    """Chuẩn hóa giá trị người dùng nhập về ``bot`` hoặc ``human``."""
    normalized = (spec or CONTROL_BOT).strip().lower()
    if normalized in ("human", "person", "mouse", "chuot"):
        return CONTROL_HUMAN
    if normalized in ("bot", "file"):
        return CONTROL_BOT
    raise ValueError(f"Chế độ điều khiển không hợp lệ: {spec}")


def create_player(
    spec: str,
    team_id: str,
    bot_path: str,
    bot_time_ms: int,
    human_turn_ms: int,
    state: Dict[str, Any],
) -> Any:
    """Tạo adapter cho một đội: bot chạy file, hoặc người thật cầm chuột.

    ``state`` là dict dùng chung để cả trận chỉ có một ``RemoteTurnBridge``.
    """
    control = normalize_control(spec)
    if control == CONTROL_HUMAN:
        bridge = state.get("bridge")
        if bridge is None:
            bridge = RemoteTurnBridge()
            state["bridge"] = bridge
        return RemoteHumanAdapter(team_id, bridge, human_turn_ms)
    return BotProcess(bot_path, team_id, bot_time_ms)


# ---------------------------------------------------------------------------
# Game Engine
# ---------------------------------------------------------------------------


class GameEngine:
    """Điều khiển một trận đấu hoàn chỉnh giữa hai bot."""

    def __init__(
        self,
        config: GameConfig,
        adapters: Dict[str, Any],
    ) -> None:
        """
        :param config: cấu hình trận đấu.
        :param adapters: dict ``team_id -> đối tượng có hàm request(payload)``.
        """
        self.config = config
        self.adapters = adapters
        self.board = Board(config.width, config.height, config.special_tiles)
        self.combat = CombatResolver(config.combat_map, config.same_type_rule)

        self.pieces: Dict[str, Piece] = {}
        self.turns: List[Dict[str, Any]] = []
        self.turn_number = 0
        self.game_over: Optional[Dict[str, Any]] = None
        self.timeouts: Dict[str, int] = {TEAM_A: 0, TEAM_B: 0}
        self.errors: Dict[str, int] = {TEAM_A: 0, TEAM_B: 0}
        self._initial_state: List[Dict[str, Any]] = []

    # -- Tiện ích -----------------------------------------------------------

    @staticmethod
    def _opponent(team: str) -> str:
        return TEAM_B if team == TEAM_A else TEAM_A

    def _team_for_turn(self, turn_no: int) -> str:
        order = [self.config.starting_team, self._opponent(self.config.starting_team)]
        return order[(turn_no - 1) % 2]

    def _piece_at(self, x: int, y: int) -> Optional[Piece]:
        for piece in self.pieces.values():
            if piece.alive and piece.pos == (x, y):
                return piece
        return None

    def _alive_count(self, team: str) -> int:
        return sum(
            1 for p in self.pieces.values() if p.alive and p.owner == team
        )

    # -- Khởi tạo -----------------------------------------------------------

    def _setup(self) -> None:
        self.pieces = {}
        for raw in self.config.initial_pieces:
            piece = Piece(
                id=raw["id"],
                owner=raw["owner"],
                type=raw["type"],
                pos=_as_pos(raw["pos"]),
                hp=int(raw.get("hp", 1)),
            )
            self.pieces[piece.id] = piece
        self._initial_state = [p.to_state() for p in self.pieces.values()]

    def _build_payload(self, team: str) -> Dict[str, Any]:
        board_state = {
            "width": self.config.width,
            "height": self.config.height,
            "coordinate_system": self.config.coordinate_system,
            "special_tiles": self.config.special_tiles,
            "turn": self.turn_number,
            "current_player": team,
        }
        my_pieces = [
            p.to_state() for p in self.pieces.values() if p.alive and p.owner == team
        ]
        opponent_pieces = [
            {**p.to_state(), "type": "UNKNOWN", "hp": 1}
            for p in self.pieces.values()
            if p.alive and p.owner == self._opponent(team)
        ]
        bot_config = {
            key: value for key, value in self.config.raw.items()
            if key != "initial_state"
        }
        return {
            "board_state": board_state,
            "my_pieces": my_pieces,
            "opponent_pieces": opponent_pieces,
            "config": bot_config,
        }

    # -- Kết thúc trận ------------------------------------------------------

    def _finish(self, winner: Optional[str], reason: str, turn: Dict[str, Any]) -> None:
        if self.game_over is not None:
            return
        self.game_over = {"winner": winner, "reason": reason}
        turn["events"].append(
            {"type": "GAME_OVER", "winner_team": winner, "reason": reason}
        )

    def _resolve_max_turns(self, turn: Dict[str, Any]) -> None:
        count_a = self._alive_count(TEAM_A)
        count_b = self._alive_count(TEAM_B)
        if count_a > count_b:
            self._finish(TEAM_A, REASON_MAX_TURNS, turn)
        elif count_b > count_a:
            self._finish(TEAM_B, REASON_MAX_TURNS, turn)
        else:
            self._finish(None, REASON_DRAW, turn)

    def _after_move(
        self,
        mover: str,
        turn: Dict[str, Any],
        base_captured_owner: Optional[str],
    ) -> None:
        if base_captured_owner is not None:
            self._finish(mover, REASON_BASE_CAPTURED, turn)
            return

        opponent = self._opponent(mover)
        if self._alive_count(opponent) == 0:
            self._finish(mover, REASON_ALL_PIECES_CAPTURED, turn)
            return
        if self._alive_count(mover) == 0:
            self._finish(opponent, REASON_ALL_PIECES_CAPTURED, turn)

    # -- Nước đi ------------------------------------------------------------

    def _destroy(self, piece: Piece) -> None:
        piece.hp = 0
        piece.alive = False

    def _validate_and_apply(
        self, team: str, action: Any
    ) -> Tuple[bool, Optional[str], List[Dict[str, Any]], Optional[str]]:
        """Kiểm tra và áp dụng nước đi.

        Trả về ``(ok, reason, events, base_captured_owner)``.
        """
        if not isinstance(action, dict):
            return False, "ACTION_NOT_OBJECT", [], None
        if action.get("action_type") != ACTION_MOVE:
            return False, "UNSUPPORTED_ACTION_TYPE", [], None

        piece_id = action.get("piece_id")
        if not isinstance(piece_id, str) or not piece_id:
            return False, "MISSING_PIECE_ID", [], None

        target = action.get("to")
        if not _is_cell(target):
            return False, "INVALID_TARGET", [], None

        piece = self.pieces.get(piece_id)
        if piece is None or not piece.alive:
            return False, "UNKNOWN_PIECE", [], None
        if piece.owner != team:
            return False, "NOT_YOUR_PIECE", [], None

        x, y = int(target[0]), int(target[1])
        if not self.board.in_bounds(x, y):
            return False, "OUT_OF_BOUNDS", [], None
        if self.board.is_obstacle(x, y):
            return False, "OBSTACLE_TILE", [], None

        fx, fy = piece.pos
        dx, dy = x - fx, y - fy
        if dx == 0 and dy == 0:
            return False, "NO_MOVEMENT", [], None
        if max(abs(dx), abs(dy)) != 1:
            return False, "MOVE_TOO_FAR", [], None
        if not self.config.allow_diagonal and dx != 0 and dy != 0:
            return False, "DIAGONAL_NOT_ALLOWED", [], None

        occupant = self._piece_at(x, y)
        if occupant is not None and occupant.owner == team:
            return False, "FRIENDLY_OCCUPIED", [], None

        # --- Áp dụng nước đi ---
        events: List[Dict[str, Any]] = []
        from_pos = [fx, fy]
        piece.pos = (x, y)
        events.append(
            {
                "type": "PIECE_MOVED",
                "piece_id": piece.id,
                "from": from_pos,
                "to": [x, y],
            }
        )

        if occupant is not None:
            attacker_loses, defender_loses = self.combat.resolve(
                piece.type, occupant.type
            )
            destroyed: List[str] = []
            damaged: List[str] = []

            if attacker_loses:
                self._destroy(piece)
                destroyed.append(piece.id)
            if defender_loses:
                self._destroy(occupant)
                destroyed.append(occupant.id)

            if attacker_loses and not defender_loses:
                winner_id: Optional[str] = occupant.id
            elif defender_loses and not attacker_loses:
                winner_id = piece.id
            else:
                winner_id = None

            events.append(
                {
                    "type": "COMBAT_RESOLVED",
                    "attacker_id": piece.id,
                    "defender_id": occupant.id,
                    "location": [x, y],
                    "winner_id": winner_id,
                    "destroyed_pieces": destroyed,
                    "damaged_pieces": damaged,
                }
            )

            if attacker_loses:
                # Quân tấn công bị hủy -> không kích hoạt bẫy/Thành.
                return True, None, events, None

        # --- Bẫy ---
        if self.board.is_trap(x, y):
            events.append(
                {
                    "type": "TRAP_TRIGGERED",
                    "piece_id": piece.id,
                    "location": [x, y],
                    "effect": self.config.trap_effect,
                }
            )
            if self.config.trap_effect == TRAP_EFFECT_DESTROYED:
                self._destroy(piece)
            return True, None, events, None

        # --- Chiếm Thành ---
        base_owner = self.board.base_owner(x, y)
        if base_owner is not None and base_owner != team:
            events.append(
                {"type": "BASE_CAPTURED", "team_id": team, "location": [x, y]}
            )
            return True, None, events, base_owner

        return True, None, events, None

    def _record_invalid(
        self, team: str, reason: str, turn: Dict[str, Any]
    ) -> None:
        turn["events"].append(
            {
                "type": "BOT_ERROR",
                "team_id": team,
                "error_message": f"INVALID_MOVE: {reason}",
            }
        )
        self.errors[team] += 1
        if self.errors[team] > self.config.max_errors:
            self._finish(self._opponent(team), REASON_OPPONENT_CRASH, turn)

    # -- Một lượt -----------------------------------------------------------

    def _play_turn(self, team: str, turn: Dict[str, Any]) -> None:
        payload = self._build_payload(team)
        adapter = self.adapters.get(team)
        if adapter is None:
            self._record_invalid(team, "NO_ADAPTER", turn)
            return

        try:
            result = adapter.request(payload)
        except Exception as exc:  # noqa: BLE001
            result = {"status": STATUS_ERROR, "error": f"ADAPTER_ERROR: {exc}"}

        if not isinstance(result, dict):
            result = {"status": STATUS_ERROR, "error": "ADAPTER_BAD_RESULT"}

        status = result.get("status")

        if status == STATUS_TIMEOUT:
            turn["events"].append(
                {
                    "type": "BOT_TIMEOUT",
                    "team_id": team,
                    "max_time_ms": self.config.bot_time_ms,
                }
            )
            self.timeouts[team] += 1
            if self.timeouts[team] > self.config.max_timeouts:
                self._finish(self._opponent(team), REASON_OPPONENT_TIMEOUT, turn)
            return

        if status in (STATUS_ERROR, STATUS_LOAD_ERROR):
            turn["events"].append(
                {
                    "type": "BOT_ERROR",
                    "team_id": team,
                    "error_message": str(result.get("error", "UNKNOWN_ERROR")),
                }
            )
            self.errors[team] += 1
            if self.errors[team] > self.config.max_errors:
                self._finish(self._opponent(team), REASON_OPPONENT_CRASH, turn)
            return

        # status == ok
        action = result.get("action")
        if action is None:
            self._record_invalid(team, "EMPTY_ACTION", turn)
            return

        ok, reason, events, base_captured_owner = self._validate_and_apply(team, action)
        if not ok:
            self._record_invalid(team, reason or "INVALID_MOVE", turn)
            return

        turn["actions"].append(
            {
                "piece_id": action.get("piece_id"),
                "action_type": ACTION_MOVE,
                "from": action.get("from", None),
                "to": action.get("to"),
            }
        )
        # Bổ sung 'from' chính xác nếu bot không cung cấp.
        moved_event = next(
            (e for e in events if e.get("type") == "PIECE_MOVED"), None
        )
        if moved_event is not None:
            turn["actions"][-1]["from"] = moved_event["from"]

        turn["events"].extend(events)
        self._after_move(team, turn, base_captured_owner)

    # -- Chạy trận ----------------------------------------------------------

    def run(self, on_event: Any = None) -> Dict[str, Any]:
        """Chạy trận đấu và tùy chọn phát các sự kiện replay sau mỗi lượt."""
        self._setup()

        if on_event is not None:
            on_event(
                {
                    "type": "match_start",
                    "match_info": {
                        "match_id": self.config.match_id,
                        "teams": self.config.teams,
                    },
                    "game_config": self.config.to_replay_config(),
                    "initial_state": self._initial_state,
                }
            )

        for turn_no in range(1, self.config.max_turns + 1):
            if self.game_over is not None:
                break

            self.turn_number = turn_no
            team = self._team_for_turn(turn_no)
            turn: Dict[str, Any] = {
                "turn": turn_no,
                "player": team,
                "actions": [],
                "events": [],
            }
            self._play_turn(team, turn)
            self.turns.append(turn)

            if self.game_over is None and turn_no == self.config.max_turns:
                self._resolve_max_turns(turn)
            if on_event is not None:
                on_event({"type": "turn", "turn": turn})

        if self.game_over is None:
            if self.turns:
                self._resolve_max_turns(self.turns[-1])
            else:
                synthetic: Dict[str, Any] = {
                    "turn": 1,
                    "player": self.config.starting_team,
                    "actions": [],
                    "events": [],
                }
                self.turns.append(synthetic)
                self._finish(None, REASON_DRAW, synthetic)
                if on_event is not None:
                    on_event({"type": "turn", "turn": synthetic})

        replay = self._build_replay()
        if on_event is not None:
            on_event(
                {
                    "type": "match_end",
                    "winner": replay["match_info"]["winner"],
                    "reason": replay["match_info"]["win_reason"],
                }
            )
        return replay

    # -- Xuất replay --------------------------------------------------------

    def _build_replay(self) -> Dict[str, Any]:
        winner = self.game_over["winner"] if self.game_over else None
        reason = self.game_over["reason"] if self.game_over else REASON_DRAW

        if winner is None:
            final_scores = {TEAM_A: 0, TEAM_B: 0}
        else:
            final_scores = {
                TEAM_A: 1 if winner == TEAM_A else 0,
                TEAM_B: 1 if winner == TEAM_B else 0,
            }

        return {
            "match_info": {
                "match_id": self.config.match_id,
                "teams": self.config.teams,
                "winner": winner,
                "win_reason": reason,
                "final_scores": final_scores,
                "total_turns": len(self.turns),
            },
            "game_config": self.config.to_replay_config(),
            "initial_state": self._initial_state,
            "turns": self.turns,
        }


# ---------------------------------------------------------------------------
# Xuất file replay
# ---------------------------------------------------------------------------


class ReplayExporter:
    """Ghi dữ liệu replay ra file ``replay.json``."""

    @staticmethod
    def write(replay: Dict[str, Any], path: str) -> str:
        """Ghi ``replay`` ra ``path`` và trả về đường dẫn tuyệt đối."""
        directory = os.path.dirname(os.path.abspath(path))
        if directory:
            os.makedirs(directory, exist_ok=True)

        with open(path, "w", encoding="utf-8") as handle:
            json.dump(replay, handle, ensure_ascii=False, indent=2)

        return os.path.abspath(path)


__all__ = [
    "PIECE_TYPES",
    "TEAM_A",
    "TEAM_B",
    "TEAMS",
    "TILE_BASE",
    "TILE_OBSTACLE",
    "TILE_TRAP",
    "ACTION_MOVE",
    "GameConfig",
    "Piece",
    "Board",
    "CombatResolver",
    "BotProcess",
    "GameEngine",
    "ReplayExporter",
]
