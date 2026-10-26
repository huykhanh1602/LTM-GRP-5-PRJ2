import { useEffect, useState } from "react";
import { sound } from "../audio/soundManager.js";
import { REASON_LABELS } from "../utils/replayEngine.js";

const AUTO_RETURN_MS = 6000;

const TITLES = { win: "CHIẾN THẮNG", lose: "BẠN THUA", draw: "HÒA" };
const ICONS = { win: "🏆", lose: "💀", draw: "🤝" };

// Banner thắng/thua giữa màn hình. Mặc định tự đưa người chơi về phòng chờ sau vài giây;
// bấm "Trạng thái" (onViewState) để đóng banner và xem nguyên trạng thái cuối ván trên bàn cờ.
// autoReturn=false khi người chơi mở lại banner thủ công: không tự thoát và không phát lại âm thanh.
export default function MatchOutcome({ result, myTeamId, onDone, onViewState, autoReturn = true }) {
  const [left, setLeft] = useState(AUTO_RETURN_MS);

  useEffect(() => {
    if (!autoReturn) return undefined;
    sound.play(result.outcome === "draw" ? "draw" : result.outcome);
    const started = Date.now();
    const tick = setInterval(() => setLeft(Math.max(0, AUTO_RETURN_MS - (Date.now() - started))), 200);
    const timer = setTimeout(onDone, AUTO_RETURN_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, []);

  const outcome = result.outcome;
  const label = REASON_LABELS[result.reason] ?? null;
  // Label trong replay viết theo góc nhìn người thắng; thua thì đổi "đối phương" thành "bạn".
  const reason =
    result.reason === "FORFEIT"
      ? outcome === "lose"
        ? "Bạn bỏ ván giữa chừng nên bị xử thua."
        : "Đối phương bỏ ván, bạn thắng."
      : outcome === "lose"
        ? label?.replace("đối phương", "bạn")
        : label;
  const change = myTeamId === "team_b" ? result.elo_change_b : myTeamId === "team_a" ? result.elo_change_a : undefined;

  return (
    <div className="outcome-layer">
      <div className={`outcome outcome--${outcome}`}>
        <div className="outcome__title">
          <span aria-hidden="true">{ICONS[outcome]}</span> {TITLES[outcome]}
        </div>
        {reason && <div className="outcome__reason">{reason}</div>}
        {typeof change === "number" && (
          <div className="outcome__elo">Elo {change >= 0 ? `+${change}` : change}</div>
        )}
        <div className="outcome__actions">
          <button className="btn big" onClick={onDone}>
            {autoReturn ? `Về phòng chờ (${Math.ceil(left / 1000)}s)` : "Về phòng chờ"}
          </button>
          {onViewState && (
            <button className="btn big outcome__view" onClick={onViewState}>
              📋 Trạng thái
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
