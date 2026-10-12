import { useCallback, useRef, useState } from "react";
import { connect } from "../api/index.js";
import { parseReplay } from "../utils/parseReplay.js";
import { appendTurn, createFrames, endFrames } from "../utils/replayEngine.js";

const INITIAL = {
  phase: "idle", // idle | connecting | room | match
  params: null,
  room: null,
  countdown: null,
  error: null,
  init: null, // { match_info, game_config, initial_state } của trận đang xem
  frames: null,
  finished: false,
  matchKey: 0, // tăng mỗi trận mới để màn hình xem trận được tạo lại từ đầu
};

// Toàn bộ trạng thái "phòng + trận trực tiếp". Giao diện chỉ đọc state và gọi hàm.
export function useRoom() {
  const chanRef = useRef(null);
  const [state, setState] = useState(INITIAL);

  const handle = useCallback((m) => {
    switch (m.type) {
      case "room_state":
        setState((p) => ({
          ...p,
          phase: p.phase === "match" ? "match" : "room",
          room: m.room,
          error: null,
        }));
        break;
      case "countdown":
        setState((p) => ({ ...p, countdown: m.seconds }));
        break;
      case "match_start": {
        try {
          const init = parseReplay({ ...m, turns: [] });
          setState((p) => ({
            ...p,
            phase: "match",
            init,
            frames: createFrames(init),
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
        setState((p) => (p.frames ? { ...p, frames: appendTurn(p.frames, m.turn) } : p));
        break;
      case "match_end":
        setState((p) =>
          p.frames ? { ...p, frames: endFrames(p.frames, m), finished: true } : p
        );
        break;
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
      setState({ ...INITIAL, phase: "connecting", params });
    },
    [handle]
  );

  const leave = useCallback(() => {
    chanRef.current?.close();
    chanRef.current = null;
    setState(INITIAL);
  }, []);

  const rematch = useCallback(() => {
    if (state.params) join(state.params);
  }, [join, state.params]);

  const setReady = useCallback((ready) => chanRef.current?.send({ type: "ready", ready }), []);

  const submit = useCallback((file) => {
    if (!chanRef.current) return Promise.reject(new Error("Chưa vào phòng."));
    return chanRef.current.submitCode(file);
  }, []);

  return { ...state, join, leave, rematch, setReady, submit };
}
