// ─────────────────────────────────────────────────────────────
// Lịch trình, quy định từ BTC và thông tin liên hệ
// ─────────────────────────────────────────────────────────────
export default function TournamentInfoPanel({ tournament }) {
  return (
    <section className="tl-card tl-info" aria-label="Lịch trình và quy định">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">Lịch trình & Quy định</h2>
          <p className="tl-card__desc">Thông tin chính thức từ Ban Tổ Chức.</p>
        </div>
      </header>

      {tournament.schedule.length > 0 ? (
        <ol className="tl-timeline">
          {tournament.schedule.map((item, index) => (
            <li key={`${item.label}-${index}`} className={item.done ? "is-done" : ""}>
              <span className="tl-timeline__dot" aria-hidden="true" />
              <div className="tl-timeline__body">
                <strong>{item.label}</strong>
                <small>{item.time}</small>
              </div>
              {index === tournament.schedule.length - 1 && !item.done && (
                <span className="tl-timeline__badge">Sắp tới</span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 12 }}>
          BTC chưa cập nhật lịch trình cho giải đấu này.
        </p>
      )}

      <div className="tl-info__rules">
        <h3>📜 Thể lệ thi đấu</h3>
        <ul>
          {tournament.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <div className="tl-info__organizer">
        <img src={tournament.organizer.avatar} alt="" />
        <div>
          <small>Ban Tổ Chức</small>
          <strong>{tournament.organizer.name}</strong>
          <span>{tournament.organizer.contact}</span>
        </div>
      </div>
    </section>
  );
}
