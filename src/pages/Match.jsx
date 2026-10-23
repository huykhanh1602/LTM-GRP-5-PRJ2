import { useState, useEffect, useRef } from "react";
import Board from "../components/Board.jsx";
import Controls from "../components/Controls.jsx";
import ResultBanner from "../components/ResultBanner.jsx";
import TeamInfo from "../components/TeamInfo.jsx";
import TurnList from "../components/TurnList.jsx";
import { useLivePlayback } from "../hooks/useLivePlayback.js";
import { makeColorOf } from "../utils/colors.js";
import { sound } from "../audio/soundManager.js";

// event.type → tên hiệu ứng âm thanh (khớp map SFX_SRC trong soundManager).
const SFX_BY_EVENT = {
  PIECE_MOVED: "move",
  REVEAL: "reveal",
  COMBAT_RESOLVED: "hit",
  TRAP_TRIGGERED: "trap",
  BASE_CAPTURED: "capture",
  FOOD_EATEN: "eat",
  SNAKE_CRASH: "crash",
};

// Xem trận TRỰC TIẾP (frames tăng dần khi server gửi lượt mới).
export default function Match({ state, onReturnToRoom, onLeave }) {
  const { init, frames, finished } = state;
  const player = useLivePlayback(frames);
  const colorOf = makeColorOf(Object.keys(init.match_info.teams));
  const [showHistory, setShowHistory] = useState(false);

  // Phát SFX khi khung hình mới xuất hiện (khi tua lại sẽ không phát trùng cùng 1 frame).
  const lastSfxIndex = useRef(-1);
  useEffect(() => {
    const frame = player.frame;
    if (!frame || frame.index === lastSfxIndex.current) return;
    lastSfxIndex.current = frame.index;
    const cue = frame.event && SFX_BY_EVENT[frame.event.type];
    if (cue) sound.play(cue);
    if (frame.over) {
      const myTeam = state.params?.teamId;
      const winner = frame.over.winner;
      if (!winner) sound.play("draw");
      else if (myTeam) sound.play(winner === myTeam ? "win" : "lose");
      else sound.play("win"); // người xem không phải người chơi → tiếng thắng chung
    }
  }, [player.frame, state.params]);

  return (
    <div>
      <div className="live-bar">
        <div className="match-status">
          {finished ? (
            <span className="badge ended">ĐÃ KẾT THÚC</span>
          ) : (
            <span className="badge live"><i /> TRỰC TIẾP</span>
          )}
          <button className="btn small" onClick={onReturnToRoom}>← Phòng chờ</button>
        </div>
        {!finished && player.behind > 0 && (
          <button className="btn small" onClick={() => player.seek(player.last)}>
            Đang chậm {player.behind} bước · Về trực tiếp ⏭
          </button>
        )}
        <button className="btn small" onClick={onLeave}>Thoát phòng</button>
      </div>

      <main className={`layout ${showHistory ? "history-expanded" : "history-collapsed"}`}>
        <section className="stage">
          <TeamInfo replay={init} frame={player.frame} colorOf={colorOf} />
          <Board board={init.game_config.board} frame={player.frame} colorOf={colorOf} />
          <ResultBanner replay={init} frame={player.frame} />
          <Controls {...player} />
          {finished && (
            <div className="end-actions">
              <button className="btn" onClick={onReturnToRoom}>← Quay lại phòng chờ</button>
            </div>
          )}
        </section>
        <aside className="side">
          <button
            className="history-toggle"
            type="button"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((visible) => !visible)}
          >
            <span>Diễn biến</span>
            <span aria-hidden="true">{showHistory ? "◀" : "▶"}</span>
          </button>
          {showHistory && (
            <TurnList
              replay={init}
              frames={frames}
              currentIndex={player.index}
              seek={player.seek}
              colorOf={colorOf}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
