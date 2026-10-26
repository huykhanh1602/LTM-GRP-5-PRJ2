import { useEffect } from "react";
import { sound } from "../audio/soundManager.js";
import { REASON_LABELS } from "../utils/replayEngine.js";

const TITLES = { win: "CHIẾN THẮNG", lose: "BẠN THUA", draw: "HÒA" };
const ICONS = { win: "🏆", lose: "💀", draw: "🤝" };

// Hiện kết quả ngay khi trận kết thúc và chờ người chơi chọn nơi tiếp tục.
export default function MatchOutcome({ result, myTeamId, onReturnToRoom, onLeave }) {
  useEffect(() => {
    sound.play(result.outcome === "draw" ? "draw" : result.outcome);
  }, [result.outcome]);

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
          <button className="btn big" onClick={onReturnToRoom}>Về phòng chờ nộp code</button>
          <button className="btn big outcome__view" onClick={onLeave}>Thoát phòng</button>
        </div>
      </div>
    </div>
  );
}
