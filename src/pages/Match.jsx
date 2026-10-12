import { useState } from "react";
import Board from "../components/Board.jsx";
import Controls from "../components/Controls.jsx";
import ResultBanner from "../components/ResultBanner.jsx";
import TeamInfo from "../components/TeamInfo.jsx";
import TurnList from "../components/TurnList.jsx";
import { useLivePlayback } from "../hooks/useLivePlayback.js";
import { makeColorOf } from "../utils/colors.js";

// Xem trận TRỰC TIẾP (frames tăng dần khi server gửi lượt mới).
export default function Match({ state, onRematch, onLeave }) {
  const { init, frames, finished } = state;
  const player = useLivePlayback(frames);
  const colorOf = makeColorOf(Object.keys(init.match_info.teams));
  const atEnd = player.index >= player.last;
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div>
      <div className="live-bar">
        {finished ? (
          <span className="badge ended">ĐÃ KẾT THÚC</span>
        ) : (
          <span className="badge live"><i /> TRỰC TIẾP</span>
        )}
        {!finished && player.behind > 0 && (
          <button className="btn small" onClick={() => player.seek(player.last)}>
            Đang chậm {player.behind} bước · Về trực tiếp ⏭
          </button>
        )}
      </div>

      <main className={`layout ${showHistory ? "history-expanded" : "history-collapsed"}`}>
        <section className="stage">
          <TeamInfo replay={init} frame={player.frame} colorOf={colorOf} />
          <Board board={init.game_config.board} frame={player.frame} colorOf={colorOf} />
          <ResultBanner replay={init} frame={player.frame} />
          <Controls {...player} />
          {finished && atEnd && (
            <div className="end-actions">
              <button className="btn primary" onClick={onRematch}>↺ Đấu lại</button>
              <button className="btn" onClick={onLeave}>Rời phòng</button>
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
