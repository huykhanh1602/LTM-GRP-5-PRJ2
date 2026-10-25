import { useEffect, useState } from "react";

const TOTAL_MS = 30_000;

// Thanh báo "đến lượt bạn" khi đấu bằng chuột: đếm giây + gợi ý cách bấm.
export default function TurnBar({ turn, myName, gameId, hasPieceSelected }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!turn) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [turn]);

  if (!turn) return null;

  const left = Math.max(0, turn.expires_at - now);
  const seconds = Math.ceil(left / 1000);
  const snake = gameId === "snake_battle";
  const hint = snake
    ? "Bấm một ô đang sáng cạnh đầu rắn để chuyển hướng."
    : hasPieceSelected
      ? "Bấm ô đích đang sáng để đi quân, hoặc bấm quân khác để đổi."
      : "Bấm một quân của bạn để chọn, rồi bấm ô đích.";

  return (
    <div className={`turn-bar ${seconds <= 5 ? "turn-bar--urgent" : ""}`} role="status">
      <div className="turn-bar__who">🖱️ Lượt của {myName || "bạn"}</div>
      <div className="turn-bar__clock">{seconds > 0 ? `${seconds}s` : "hết giờ"}</div>
      <div className="turn-bar__track" aria-hidden="true">
        <div className="turn-bar__fill" style={{ width: `${Math.min(100, (left / TOTAL_MS) * 100)}%` }} />
      </div>
      <div className="turn-bar__hint">
        {seconds > 0 ? hint : "Hết giờ — đội tự đi nước an toàn nhất."}
      </div>
    </div>
  );
}
