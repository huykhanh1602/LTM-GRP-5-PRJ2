// SERVER GIẢ chạy ngay trong trình duyệt, để làm và thử giao diện khi server thật chưa có.
// Giao diện giống hệt kênh WebSocket thật (xem socket.js và docs/PROTOCOL.md):
//   channel.on(fn)  channel.send(msg)  channel.submitCode(file)  channel.close()
//
// Kịch bản giả: đối thủ vào phòng sau 1.5s, nộp code sau 3s, sẵn sàng sau 4.5s.
// Khi cả 2 sẵn sàng: đếm ngược 3-2-1, rồi phát lại replay mẫu từng lượt như đang đấu thật.

export function createMockChannel({
  code,
  teamName,
  role,
  replay,
  timeScale = 1, // đặt nhỏ (ví dụ 0.01) để chạy test nhanh
  turnMs = 1600,
}) {
  const listeners = new Set();
  const timers = new Set();
  let closed = false;
  let startToken = 0;

  const wait = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!closed) fn();
    }, ms * timeScale);
    timers.add(t);
    return t;
  };
  const emit = (m) => listeners.forEach((l) => l(m));

  const names = replay.match_info.teams;
  const spectator = role === "spectator";
  const room = {
    code,
    status: "waiting", // waiting | countdown | playing | finished
    teams: [
      {
        id: "team_a",
        name: spectator ? names.team_a : teamName,
        isMe: !spectator,
        connected: spectator ? false : true,
        submitted: false,
        ready: false,
        filename: null,
      },
      {
        id: "team_b",
        name: names.team_b,
        isMe: false,
        connected: false,
        submitted: false,
        ready: false,
        filename: null,
      },
    ],
  };
  const A = room.teams[0];
  const B = room.teams[1];
  const pushRoom = () => emit({ type: "room_state", room: structuredClone(room) });

  function maybeStart() {
    if (room.status !== "waiting" || !(A.ready && B.ready)) return;
    room.status = "countdown";
    pushRoom();
    const token = ++startToken;
    [3, 2, 1].forEach((n, i) =>
      wait(i * 1000, () => token === startToken && emit({ type: "countdown", seconds: n }))
    );
    wait(3000, () => token === startToken && startMatch());
  }

  function cancelCountdown() {
    if (room.status !== "countdown") return;
    startToken++;
    room.status = "waiting";
    emit({ type: "countdown", seconds: null });
    pushRoom();
  }

  function startMatch() {
    room.status = "playing";
    pushRoom();
    const { winner, win_reason, final_scores, ...info } = replay.match_info;
    emit({
      type: "match_start",
      match_info: { ...info, match_id: `LIVE-${code}`, teams: { team_a: A.name, team_b: B.name } },
      game_config: replay.game_config,
      initial_state: replay.initial_state,
    });
    replay.turns.forEach((turn, i) => wait(800 + (i + 1) * turnMs, () => emit({ type: "turn", turn })));
    wait(800 + (replay.turns.length + 1) * turnMs + 600, () => {
      room.status = "finished";
      pushRoom();
      emit({ type: "match_end", winner, reason: win_reason ?? null });
    });
  }

  // Kịch bản đối thủ giả
  wait(0, pushRoom);
  wait(1500, () => { B.connected = true; if (spectator) A.connected = true; pushRoom(); });
  wait(3000, () => { B.submitted = true; B.filename = "bot_beta.py"; if (spectator) { A.submitted = true; A.filename = "bot_alpha.py"; } pushRoom(); });
  wait(4500, () => { B.ready = true; if (spectator) A.ready = true; pushRoom(); maybeStart(); });

  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    send(msg) {
      if (spectator) return;
      if (msg.type === "ready") {
        if (msg.ready && !A.submitted) {
          emit({ type: "error", message: "Hãy nộp code trước khi bấm Sẵn sàng." });
          return;
        }
        A.ready = !!msg.ready;
        pushRoom();
        if (A.ready) maybeStart();
        else cancelCountdown();
      }
    },
    async submitCode(file) {
      await new Promise((r) => setTimeout(r, 700 * timeScale));
      if (closed) throw new Error("Đã rời phòng.");
      if (room.status !== "waiting") throw new Error("Trận đã bắt đầu, không nộp được nữa.");
      A.submitted = true;
      A.ready = false;
      A.filename = file?.name ?? "code";
      pushRoom();
      return { id: `mock-${Date.now()}`, filename: A.filename };
    },
    close() {
      closed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      listeners.clear();
    },
  };
}
