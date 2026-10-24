import { useEffect, useMemo, useState } from "react";
import TrophyIcon from "../TrophyIcon.jsx";
import { getTournaments } from "../../api.js";
import { apiErrorText, participantUnit, registrationWindowState, toTournamentCard, tournamentScheduleLines } from "../../utils/tournamentApi.js";
import { STATUS_BADGE } from "../../utils/tournamentStatus.js";

// ─────────────────────────────────────────────────────────────
// Danh sách giải đấu thật — dùng khi chưa chọn giải nào
// ─────────────────────────────────────────────────────────────
export default function TournamentPicker({ gameId, onPick, onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    getTournaments({ limit: 100 })
      .then((data) => active && setItems(data.items.map(toTournamentCard)))
      .catch((err) => active && setError(apiErrorText(err)));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (items ?? []).filter((item) => !gameId || item.gameId === gameId),
    [items, gameId],
  );

  return (
    <div className="tl-page">
      <div className="tl-toolbar">
        {onBack && (
          <button type="button" className="btn small tl-toolbar__back" onClick={onBack}>
            ← Quay lại
          </button>
        )}
        <nav className="tl-breadcrumb" aria-label="Đường dẫn">
          <span>Trang chủ</span>
          <i aria-hidden="true">/</i>
          <strong>Giải đấu</strong>
        </nav>
      </div>

      <div className="tl-shell">
        <section className="tl-card">
          <header className="tl-card__head">
            <div>
              <h2 className="tl-card__title">Chọn giải đấu</h2>
              <p className="tl-card__desc">Mỗi giải đấu có một phòng chờ riêng.</p>
            </div>
          </header>

          {error && <p className="err">{error}</p>}
          {!items && !error && <p className="muted">Đang tải danh sách giải đấu…</p>}
          {visible?.length === 0 && (
            <div className="tl-empty">
              <span className="tl-empty__icon"><TrophyIcon size="56px" /></span>
              <h3>Chưa có giải đấu nào</h3>
              <p>Vào Trang cá nhân để mở giải đấu mới.</p>
            </div>
          )}

          <div className="tour-list-container">
            {visible?.map((item) => {
              const scheduleLines = tournamentScheduleLines(item);
              const windowState = registrationWindowState(item);
              return (
              <button key={item.id} type="button" className="tour-card-item" onClick={() => onPick(item.id)}>
                <div className="tour-card-top">
                  <div>
                    <span className="tour-card-code">{item.code}</span>
                    <h4 className="tour-card-title">{item.name}</h4>
                  </div>
                  <span className={`tour-status-badge ${STATUS_BADGE[item.status]?.className ?? ""}`}>
                    {STATUS_BADGE[item.status]?.label ?? item.status}
                  </span>
                </div>
                <div className="tour-card-meta">
                  <span>🎮 {item.gameName}</span>
                  <span>👑 {item.organizerName}</span>
                  <span>
                    👥 {item.registered}
                    {item.capacity ? `/${item.capacity}` : ""} {participantUnit(item.participantMode)}
                  </span>
                </div>
                <div className="tour-card-schedule">
                  {scheduleLines.map((line) => (
                    <span key={line.label}>
                      {line.icon} {line.label}: <b>{line.value}</b>
                    </span>
                  ))}
                  {windowState && (
                    <span className={`tour-window-state tour-window-state--${windowState.cls}`}>
                      {windowState.text}
                    </span>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}