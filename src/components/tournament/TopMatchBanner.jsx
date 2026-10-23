// ─────────────────────────────────────────────────────────────
// TopMatchBanner — My Match Banner hiển thị trên cùng trang Giải đấu
// khi giải đang diễn ra (in_progress) và user có trận đang chờ sẵn sàng.
// Giao diện kiểu bảng tỉ số bóng đá: [ A ] VS [ B ] + badge sẵn sàng 2 bên.
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
  const badge = side.ready
    ? { text: "✓ Sẵn sàng", cls: "tm-badge tm-badge--ready" }
    : { text: "○ Chờ", cls: "tm-badge tm-badge--wait" };
  const initial = (side.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`tm-side${isMe ? " tm-side--me" : ""}`}>
      <span className="tm-avatar" aria-hidden="true">
        {initial}
      </span>
      <div className="tm-side__info">
        <span className="tm-side__name">{side.name ?? "—"}</span>
        <span className={badge.cls}>{badge.text}</span>
        {side.submissionId && isMe && (
          <span className="tm-file">📎 {side.filename ?? "Đã nộp code"}</span>
        )}
      </div>
    </div>
  );
}

export function TopMatchBanner({ match, deadline, busy, submitting, onSetReady, onSubmitCode, onOpenReplay }) {
  if (!match?.found) return null;
  const { me, opponent, mode, matchId, bothReady } = match;
  const isPerRound = mode === "PER_ROUND";

  const canReady = me.submitted && !me.ready;
  const readyLabel = me.ready ? "Hủy sẵn sàng" : "✓ Sẵn sàng thi đấu";
  const readyHint = !me.submitted
    ? isPerRound
      ? `Bước 1: nộp code cho vòng ${match.roundNo} bên dưới.`
      : "Bạn chưa đăng ký bot cho giải này."
    : me.ready
      ? "Đang chờ đối thủ sẵn sàng…"
      : "Bấm để xác nhận bạn đã chuẩn bị xong cho trận này.";

  return (
    <section className="tm-banner tl-card" aria-label="Trận đấu của tôi">
      <header className="tm-banner__head">
        <div>
          <h2 className="tm-title">
            ⚔️ Trận đấu của tôi
            <span className="tm-vs">— Vòng {match.roundNo}</span>
          </h2>
          <p className="tm-desc">{isPerRound ? "Nộp code mỗi vòng trước deadline rồi bấm Sẵn sàng." : "Dùng bot đã đăng ký, chỉ cần bấm Sẵn sàng."}</p>
        </div>
        {isPerRound && <Countdown deadline={deadline} />}
      </header>

      {matchId ? (
        <div className="tm-live">
          <p>🎮 Trận đấu đang diễn ra — hãy xem kết quả & replay.</p>
          <button type="button" className="btn primary" onClick={() => onOpenReplay?.(matchId)}>
            ▶ Xem Match Replay
          </button>
        </div>
      ) : bothReady ? (
        <div className="tm-live">
          <p>🚀 Cả hai đã sẵn sàng — trận đấu sẽ tự động khởi tranh…</p>
        </div>
      ) : (
        <>
          <div className="tm-vs-row">
            <Side side={me} isMe />
            <span className="tm-center">VS</span>
            <Side side={opponent} isMe={false} />
          </div>

          <div className="tm-actions">
            {isPerRound && (
              <button
                type="button"
                className="btn"
                disabled={submitting || me.ready}
                onClick={() => onSubmitCode?.()}
              >
                {me.submitted ? "✏️ Đổi code vòng này" : "📝 Nộp / Cập nhật code"}
              </button>
            )}
            <button
              type="button"
              className={`btn ${canReady ? "primary" : ""}`}
              disabled={!me.submitted || busy || submitting}
              onClick={() => onSetReady?.(!me.ready)}
            >
              {readyLabel}
            </button>
          </div>
          <p className="tm-hint">{readyHint}</p>
        </>
      )}
    </section>
  );
}