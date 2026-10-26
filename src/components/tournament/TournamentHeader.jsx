import { useEffect, useState } from "react";
import TrophyIcon from "../TrophyIcon.jsx";
import { controlsLabel } from "../../utils/tournamentApi.js";

// Đếm ngược tới mốc thời gian của giải đấu
function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return null;

  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return { ended: true, days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    ended: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

// ─────────────────────────────────────────────────────────────
// Header thông tin giải đấu: tên, game, trạng thái, đếm ngược, BTC
// ─────────────────────────────────────────────────────────────
export default function TournamentHeader({ tournament }) {
  const countdown = useCountdown(tournament.countdownTarget);
  const waitingStart = tournament.status === "open";

  const STATUS_CLASS_MAP = { open: "open", in_progress: "running", completed: "ended", draft: "draft", cancelled: "cancelled" };
  const statusClass = STATUS_CLASS_MAP[tournament.status] ?? tournament.status;

  return (
    <section className="tl-hero">
      <span className="tl-hero__glow" aria-hidden="true" />

      <div className="tl-hero__row">
        <div className="tl-hero__identity">
          <div className="tl-hero__logo-wrap">
            <img
              className="tl-hero__logo"
              src={tournament.game.logo}
              alt={tournament.game.name}
            />
          </div>

          <div className="tl-hero__text">
            <div className="tl-hero__eyebrow">
              <span className={`tl-mode-badge tl-mode-badge--${tournament.participantMode === "TEAM" ? "team" : "solo"}`}>
                {tournament.participantMode === "TEAM" ? "Giải Đội" : "Giải Cá Nhân"}
              </span>
              <span className="tl-mode-badge">{controlsLabel(tournament.allowedControls)}</span>
              <span className={`tl-status tl-status--${statusClass}`}>
                <i aria-hidden="true" />
                {tournament.status === "open" ? "Đang mở đăng ký" : tournament.status === "in_progress" ? "Đã khởi tranh" : tournament.status === "completed" ? "Đã kết thúc" : tournament.statusLabel}
              </span>
              <span className="tl-hero__format">{tournament.formatLabel}</span>
            </div>

            <h1 className="tl-hero__title">{tournament.name}</h1>

            <p className="tl-hero__sub">
              🎮 {tournament.game.name}
              <span className="tl-dot-sep" aria-hidden="true">•</span>
              mã giải <code className="tl-code">{tournament.code}</code>
              <span className="tl-dot-sep" aria-hidden="true">•</span>
              👑 {tournament.organizer.name}
            </p>
          </div>
        </div>

        {countdown && (
          <div className="tl-countdown" role="timer" aria-live="off">
            <span className="tl-countdown__label">{tournament.countdownLabel}</span>
            {countdown.ended ? (
              waitingStart ? (
                <strong className="tl-countdown__ended tl-countdown__ended--waiting">
                  ⏳ Chờ chủ giải khởi tranh
                </strong>
              ) : (
                <strong className="tl-countdown__ended">Đã bắt đầu</strong>
              )
            ) : (
              <div className="tl-countdown__clock">
                {countdown.days > 0 && (
                  <div className="tl-countdown__unit">
                    <b>{countdown.days}</b>
                    <small>ngày</small>
                  </div>
                )}
                <div className="tl-countdown__unit">
                  <b>{pad(countdown.hours)}</b>
                  <small>giờ</small>
                </div>
                <div className="tl-countdown__unit">
                  <b>{pad(countdown.minutes)}</b>
                  <small>phút</small>
                </div>
                <div className="tl-countdown__unit tl-countdown__unit--seconds">
                  <b>{pad(countdown.seconds)}</b>
                  <small>giây</small>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tl-hero__meta">
        <span className="tl-meta-chip">
          👥{" "}
          <strong>
            {tournament.registered}/{tournament.capacity}
          </strong>{" "}
          bot đã đăng ký
        </span>
        <span className="tl-meta-chip">🎁 {tournament.prize}</span>
        <span className="tl-meta-chip">🧩 {tournament.formatLabel}</span>
      </div>

      <p className="tl-hero__hint">
        <span aria-hidden="true">ℹ️</span> {tournament.statusHint}
      </p>
    </section>
  );
}
