// ─────────────────────────────────────────────────────────────
// TopMatchBanner — Banner trận đấu hiển thị trên cùng trang Giải đấu.
// - Nếu isParticipant === true:  hiển thị nút "Vào phòng đấu" / "Sẵn sàng" / "Nộp code".
// - Nếu isParticipant === false: chỉ hiển thị [ A ] VS [ B ] + nút "👁️ Xem trực tiếp".
// - Hỗ trợ 2 chế độ nộp code: PER_ROUND (nộp theo vòng) và SINGLE (nộp 1 lần).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { SubmissionModal } from "./SubmissionModal.jsx";

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

export function TopMatchBanner({ match, deadline, busy, onEnterRoom, onWatchRoom, onOpenReplay, onSubmit, onReady }) {
  const [showSubmission, setShowSubmission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  if (!match?.found) return null;
  const { me, opponent, mode, matchId, isParticipant, roundNo } = match;
  const spectator = isParticipant === false;
  const isPerRound = mode === "PER_ROUND";
  const minutes = match.submissionWindowMinutes ?? 10;

  // Xác định trạng thái nộp code và sẵn sàng
  const needsSubmission = isPerRound
    ? !me.submitted          // PER_ROUND: cần nộp code mỗi vòng
    : !me.submissionId;      // SINGLE: cần nộp code lần đầu (chưa có bot đại diện)
  const canReady = isPerRound
    ? me.submitted && !me.ready   // PER_ROUND: đã nộp code mới được sẵn sàng
    : me.submissionId && !me.ready; // SINGLE: đã có bot đại diện mới được sẵn sàng
  const isReady = me.ready;

  async function handleSubmission({ roundNo: rn, filename, source }) {
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ roundNo: rn, filename, source });
      setShowSubmission(false);
    } finally {
      setSubmitting(false);
    }
  }

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
                  ? `Cửa sổ nộp code vòng này là ${minutes} phút. Nộp code và bấm Sẵn sàng để vào trận.`
                  : (needsSubmission
                      ? `Nộp bot đại diện lần đầu. Bot này sẽ được dùng cho toàn bộ giải đấu.`
                      : `Bot đại diện đã được đăng ký. Bấm Sẵn sàng khi sẵn sàng thi đấu.`))}
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
        <>
          <div className="tm-actions">
            {/* Nút Nộp code — chỉ hiện khi cần nộp */}
            {needsSubmission && onSubmit && (
              <button
                type="button"
                className="btn primary big"
                disabled={busy}
                onClick={() => setShowSubmission(true)}
              >
                📝 Nộp code
              </button>
            )}

            {/* Nút Sẵn sàng — chỉ hiện khi đã nộp code và chưa sẵn sàng */}
            {canReady && onReady && (
              <button
                type="button"
                className="btn primary big"
                disabled={busy}
                onClick={() => onReady(true)}
              >
                ✔ Sẵn sàng
              </button>
            )}

            {/* Đã sẵn sàng */}
            {isReady && (
              <span className="tm-hint">✅ Bạn đã sẵn sàng — đang chờ đối thủ…</span>
            )}

            {/* Nút vào phòng đấu — luôn hiện */}
            <button
              type="button"
              className="btn"
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

      {showSubmission && (
        <SubmissionModal
          roundNo={roundNo}
          deadline={deadline}
          submitting={submitting}
          onClose={() => setShowSubmission(false)}
          onSubmit={handleSubmission}
        />
      )}
    </section>
  );
}