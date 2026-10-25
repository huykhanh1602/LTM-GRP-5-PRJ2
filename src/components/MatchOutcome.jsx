import { useEffect, useState } from "react";
import { sound } from "../audio/soundManager.js";
import { REASON_LABELS } from "../utils/replayEngine.js";

const AUTO_RETURN_MS = 6000;

const TITLES = { win: "CHIẾN THẮNG", lose: "BẠN THUA", draw: "HÒA" };
const ICONS = { win: "🏆", lose: "💀", draw: "🤝" };

// Banner thắng/thua giữa màn hình, tự động đưa người chơi về phòng chờ.
export default function MatchOutcome({ result, myTeamId, onDone }) {
  const [left, setLeft] = useState(AUTO_RETURN_MS);

  useEffect(() => {
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
        <button className="btn big" onClick={onDone}>
          Về phòng chờ ({Math.ceil(left / 1000)}s)
        </button>
      </div>
    </div>
  );
}
