// ─────────────────────────────────────────────────────────────
// Lịch trình, luật chơi do chủ giải đặt ra và thông tin liên hệ
// ─────────────────────────────────────────────────────────────
import { languageLabels } from "../../utils/botLanguages.js";

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
        <h3>📜 Luật chơi do chủ giải đặt ra</h3>
        {tournament.rules.length > 0 ? (
          <ul>
            {tournament.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Chủ giải chưa đăng thể lệ cho giải đấu này.
          </p>
        )}
      </div>

      {tournament.languages?.length > 0 && (
        <div className="tl-info__rules">
          <h3>🌐 Ngôn ngữ bot được phép</h3>
          <ul>
            {tournament.languages.map((id) => (
              <li key={id}>{languageLabels([id])}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="tl-info__organizer">
        <img src={tournament.organizer.avatar} alt="" />
        <div>
          <small>Người tổ chức</small>
          <strong>{tournament.organizer.name}</strong>
          <span>{tournament.organizer.contact}</span>
        </div>
      </div>
    </section>
  );
}
