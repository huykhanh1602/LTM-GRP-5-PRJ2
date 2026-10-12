import { useEffect, useRef } from "react";
import { describeEvent, teamName } from "../utils/replayEngine.js";
import Media from "./Media.jsx";
import { theme } from "../theme/theme.js";

// Danh sách các sự kiện, nhóm theo lượt. Bấm để nhảy tới bước đó.
export default function TurnList({ replay, frames, currentIndex, seek, colorOf }) {
  const listRef = useRef(null);
  const activeRef = useRef(null);

  // Chỉ cuộn BÊN TRONG danh sách (không dùng scrollIntoView vì nó kéo cả trang).
  useEffect(() => {
    const list = listRef.current;
    const el = activeRef.current;
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = Math.max(0, top - 6);
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 6;
    }
  }, [currentIndex]);

  const rows = [];
  let lastTurn = null;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.turn !== lastTurn) {
      lastTurn = f.turn;
      rows.push(
        <div key={`t${f.turn}-${i}`} className="turn-head" style={{ "--team": colorOf(f.player) }}>
          Lượt {f.turn}
          {f.player && <span> · {teamName(replay, f.player)}</span>}
        </div>
      );
    }
    const d = describeEvent(f.event, replay);
    const iconSrc = theme.eventIcons[f.event?.type];
    const isMove = f.event?.type === "PIECE_MOVED";
    const isScore = f.event?.type === "SCORE_UPDATED";
    const isCur = i === currentIndex;
    rows.push(
      <button
        key={i}
        ref={isCur ? activeRef : null}
        className={`turn-item ${isCur ? "current" : ""} ${i < currentIndex ? "past" : ""}`}
        onClick={() => seek(i)}
      >
        <span className="turn-icon">
          {isMove || isScore ? (
            <span
              className={`turn-icon-dot ${isScore ? "score" : "move"}`}
              style={isMove ? { "--team": colorOf(f.player) } : undefined}
              aria-hidden="true"
            />
          ) : iconSrc ? (
            <Media className="turn-icon-image" src={iconSrc} fallback={d.icon} />
          ) : (
            d.icon
          )}
        </span>
        <span>{d.text}</span>
      </button>
    );
  }

  return (
    <div className="turn-list" ref={listRef}>
      {rows}
    </div>
  );
}
