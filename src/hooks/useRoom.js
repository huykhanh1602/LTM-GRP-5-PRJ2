import { useCallback, useRef, useState } from "react";
import { connect } from "../api/index.js";
import { appendTurn, createFrames, endFrames } from "../utils/replayEngine.js";
import { appendLiveReplayTurn, createLiveReplay, finishLiveReplay } from "../utils/liveReplay.js";

const INITIAL = {
  phase: "idle", // idle | connecting | queue | room | match
  params: null,
  room: null,
  queue: null, // { wait_time, mode } khi đang chờ ghép trận
  countdown: null,
  error: null,
  init: null, // { match_info, game_config, initial_state } của trận đang xem
  replay: null, // Replay đầy đủ của trận gần nhất
  frames: null,
  finished: false,
  matchKey: 0, // tăng mỗi trận mới để màn hình xem trận được tạo lại từ đầu
};

// Toàn bộ trạng thái "phòng + trận trực tiếp". Giao diện chỉ đọc state và gọi hàm.
export function useRoom() {
  const chanRef = useRef(null);
  const liveReplayRef = useRef(null);
  const lastReplayRef = useRef(null);
  const [state, setState] = useState(INITIAL);

  const handle = useCallback((m) => {
    switch (m.type) {
      case "joined":
        if (m.team_id) {
          setState((p) => ({
            ...p,
            params: p.params ? { ...p.params, teamId: m.team_id } : p.params,
          }));
        }
        break;
      case "queue_state":
        // in_queue=false đến ngay trước match_found nên bỏ qua; rời hàng đợi là do người dùng bấm Hủy.
        if (m.in_queue) {
          setState((p) => ({ ...p, phase: "queue", queue: { wait_time: m.wait_time, mode: m.mode }, error: null }));
        }
        break;
      case "match_found":
        setState((p) => ({ ...p, phase: "connecting", queue: null, opponent: m.opponent ?? null }));
        break;
      case "room_state":
        setState((p) => ({
          ...p,
          phase: p.phase === "match" && (!p.finished || m.room.status === "finished" || m.room.status === "playing")
            ? "match"
            : "room",
          room: m.room,
          queue: null,
          error: null,
        }));
        break;
      case "countdown":
        setState((p) => ({ ...p, countdown: m.seconds }));
        break;
      case "match_start": {
        try {
          const replay = createLiveReplay(m);
          liveReplayRef.current = replay;
          setState((p) => ({
            ...p,
            phase: "match",
            init: replay,
            frames: createFrames(replay),
            finished: false,
            countdown: null,
            error: null,
            matchKey: p.matchKey + 1,
          }));
        } catch (e) {
          setState((p) => ({ ...p, error: "Dữ liệu bắt đầu trận không hợp lệ:\n" + e.message }));
        }
        break;
      }
      case "turn":
        if (liveReplayRef.current) {
          liveReplayRef.current = appendLiveReplayTurn(liveReplayRef.current, m.turn);
        }
        setState((p) => (p.frames ? { ...p, frames: appendTurn(p.frames, m.turn) } : p));
        break;
      case "match_end": {
        const replay = finishLiveReplay(liveReplayRef.current, m);
        liveReplayRef.current = null;
        if (replay) lastReplayRef.current = replay;
        setState((p) =>
          p.frames ? {
            ...p,
            frames: endFrames(p.frames, m),
            replay: replay ?? lastReplayRef.current,
            finished: true,
          } : p
        );
        break;
      }
      case "error":
        setState((p) => ({ ...p, error: m.message }));
        break;
      default:
        break; // tin lạ: bỏ qua, không làm vỡ giao diện
    }
  }, []);

  const join = useCallback(
    (params) => {
      chanRef.current?.close();
      const ch = connect(params);
      chanRef.current = ch;
      ch.on((m) => {
        if (chanRef.current === ch) handle(m);
      });
      liveReplayRef.current = null;
      setState({ ...INITIAL, phase: "connecting", params, replay: lastReplayRef.current });
    },
    [handle]
  );

  const leave = useCallback(() => {
    chanRef.current?.close();
    chanRef.current = null;
    liveReplayRef.current = null;
    setState({ ...INITIAL, replay: lastReplayRef.current });
  }, []);

  const setReady = useCallback((ready) => chanRef.current?.send({ type: "ready", ready }), []);

  const returnToRoom = useCallback(() => {
    setState((p) => (p.room ? { ...p, phase: "room" } : p));
  }, []);

  const submit = useCallback((file) => {
    if (!chanRef.current) return Promise.reject(new Error("Chưa vào phòng."));
    return chanRef.current.submitCode(file);
  }, []);

  return { ...state, join, leave, returnToRoom, setReady, submit };
}
