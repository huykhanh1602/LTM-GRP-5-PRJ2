// ─────────────────────────────────────────────────────────────
// TopMatchBanner — My Match Banner hiển thị trên cùng trang Giải đấu
// khi giải đang diễn ra (in_progress) và user có trận trong vòng hiện tại.
// Giao diện kiểu bảng tỉ số bóng đá: [ A ] VS [ B ].
// Nút duy nhất: "Vào phòng đấu" → mở phòng riêng của trận (Room.jsx),
// chỉ 2 tuyển thủ của trận mới là người chơi, còn lại là khán giả.
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
  const badge = side.submitted
    ? { text: "✓ Đã nộp code", cls: "tm-badge tm-badge--ready" }
    : { text: "○ Chưa nộp code", cls: "tm-badge tm-badge--wait" };
  const initial = (side.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`tm-side${isMe ? " tm-side--me" : ""}`}>
      <span className="tm-avatar" aria-hidden="true">
        {initial}
      </span>
      <div className="tm-side__info">
        <span className="tm-side__name">{side.name ?? "—"}</span>
        <span className={badge.cls}>{badge.text}</span>
        {side.filename && isMe && <span className="tm-file">📎 {side.filename}</span>}
      </div>
    </div>
  );
}

export function TopMatchBanner({ match, deadline, busy, onEnterRoom, onWatchRoom }) {
  if (!match?.found) return null;
  const { me, opponent, mode, matchId, windowLabel } = match;
  const isPerRound = mode === "PER_ROUND";
  const minutes = match.submissionWindowMinutes ?? 10;

  return (
    <section className="tm-banner tl-card" aria-label="Trận đấu của tôi">
      <header className="tm-banner__head">
        <div>
          <h2 className="tm-title">
            ⚔️ Trận đấu của tôi
            <span className="tm-vs">— Vòng {match.roundNo}</span>
          </h2>
          <p className="tm-desc">
            {isPerRound
              ? `Cửa sổ nộp code vòng này là ${minutes} phút. Vào phòng đấu để nộp code và thi đấu.`
              : `Dùng bot đã đăng ký — vào phòng đấu và bấm Sẵn sàng khi sẵn sàng. Hạn ${minutes} phút.`}
          </p>
        </div>
        {deadline && <Countdown deadline={deadline} />}
      </header>

      {matchId ? (
        <div className="tm-live">
          <p>🎮 Trận đấu đang diễn ra — hãy vào phòng đấu để theo dõi hoặc thi đấu.</p>
        </div>
      ) : (
        <>
          <div className="tm-vs-row">
            <Side side={me} isMe />
            <span className="tm-center">VS</span>
            <Side side={opponent} isMe={false} />
          </div>

          <div className="tm-actions">
            <button
              type="button"
              className="btn primary big"
              disabled={busy}
              onClick={() => onEnterRoom?.()}
            >
              🚪 Vào phòng đấu
            </button>
            {onWatchRoom && (
              <button type="button" className="btn" disabled={busy} onClick={() => onWatchRoom?.()}>
                👁 Xem với tư cách khán giả
              </button>
            )}
          </div>
          <p className="tm-hint">
            Phòng chỉ nhận <strong>2 tuyển thủ của trận</strong> làm người chơi. Nếu hết giờ mà chưa nộp code,
            bạn sẽ bị <strong>xử thua</strong>; cả 2 chưa nộp thì hệ thống <strong>chọn ngẫu nhiên 1 người</strong> đi tiếp.
          </p>
        </>
      )}
    </section>
  );
}