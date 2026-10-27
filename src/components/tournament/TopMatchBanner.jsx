// ─────────────────────────────────────────────────────────────
// TopMatchBanner — Banner trận đấu hiển thị trên cùng trang Giải đấu.
// - Nếu isParticipant === true:  hiển thị "🚪 Vào phòng đấu" (primary) + "👁️ Xem với tư cách khán giả".
// - Nếu isParticipant === false: chỉ hiển thị [ A ] VS [ B ] + nút "👁️ Xem trực tiếp".
// - Việc nộp code được thực hiện trực tiếp bên trong phòng đấu/Room.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

function Countdown({ deadline }) {
  const [text, setText] = useState("--:--");
  useEffect(() => {
    if (!deadline) {
      setText("--:--");
      return undefined;
    }
    function tick() {
      const left = Math.max(0, new Date(deadline).getTime() - Date.now());
      const total = Math.floor(left / 1000);
      const mm = String(Math.floor(total / 60)).padStart(2, "0");
      const ss = String(total % 60).padStart(2, "0");
      setText(`⏳ ${mm}:${ss}`);
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return <span className="tm-countdown">{text}</span>;
}

function Side({ side, isMe }) {
  const initial = (side.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`tm-side${isMe ? " tm-side--me" : ""}`}>
      <span className="tm-avatar" aria-hidden="true">
        {initial}
      </span>
      <div className="tm-side__info">
        <span className="tm-side__name">{side.name ?? "—"}</span>
        {side.submitted !== undefined && (
          <span className={side.submitted ? "tm-badge tm-badge--ready" : "tm-badge tm-badge--wait"}>
            {side.submitted ? "✓ Đã nộp code" : "○ Chưa nộp code"}
          </span>
        )}
        {side.filename && isMe && <span className="tm-file">📎 {side.filename}</span>}
      </div>
    </div>
  );
}

export function TopMatchBanner({ match, deadline, busy, onEnterRoom, onWatchRoom, onOpenReplay }) {
  if (!match?.found) return null;
  const { me, opponent, mode, matchId, isParticipant, roundNo } = match;
  const spectator = isParticipant === false;
  const isPerRound = mode === "PER_ROUND";
  const minutes = match.submissionWindowMinutes ?? 10;

  return (
    <section className="tm-banner tl-card" aria-label={spectator ? "Trận đấu" : "Trận đấu của tôi"}>
      <header className="tm-banner__head">
        <div>
          <h2 className="tm-title">
            {spectator ? "⚔️ Trận đấu" : "⚔️ Trận đấu của tôi"}
            <span className="tm-vs">— Vòng {roundNo}</span>
          </h2>
          <p className="tm-desc">
            {spectator
              ? (matchId ? "Trận đấu đang diễn ra." : "Đang chờ 2 bên sẵn sàng.")
              : (isPerRound
                  ? `Cửa sổ nộp code vòng này là ${minutes} phút. Vào phòng đấu để nộp code và thi đấu.`
                  : `Vào phòng đấu để nộp bot đại diện và thi đấu.`)}
          </p>
        </div>
        {!spectator && deadline && !match.bothReady && !matchId && <Countdown deadline={deadline} />}
      </header>

      <div className="tm-vs-row">
        <Side side={me} isMe={!spectator} />
        <span className="tm-center">VS</span>
        <Side side={opponent} isMe={false} />
      </div>

      {spectator ? (
        <div className="tm-actions">
          {matchId ? (
            <button type="button" className="btn primary big" onClick={() => onWatchRoom?.()}>
              👁️ Xem trực tiếp
            </button>
          ) : (
            <span className="tm-hint">⏳ Đang chờ 2 bên sẵn sàng</span>
          )}
          {onOpenReplay && matchId && (
            <button type="button" className="btn" onClick={() => onOpenReplay?.(matchId)}>
              📺 Xem Replay
            </button>
          )}
        </div>
      ) : matchId ? (
        <div className="tm-live">
          <p>🎮 Trận đấu đang diễn ra — hãy vào phòng đấu để theo dõi hoặc thi đấu.</p>
          <button type="button" className="btn primary big" onClick={() => onEnterRoom?.()}>
            🚪 Vào phòng đấu
          </button>
        </div>
      ) : (
        <div className="tm-actions">
          {/* Nút Vào phòng đấu — Primary, luôn hoạt động với callback của ô "Trận đấu đang mở" */}
          <button
            type="button"
            className="btn primary big"
            onClick={() => onEnterRoom?.()}
          >
            🚪 Vào phòng đấu
          </button>

          {onWatchRoom && (
            <button type="button" className="btn" disabled={busy} onClick={() => onWatchRoom?.()}>
              👁️ Xem với tư cách khán giả
            </button>
          )}
        </div>
      )}
    </section>
  );
}