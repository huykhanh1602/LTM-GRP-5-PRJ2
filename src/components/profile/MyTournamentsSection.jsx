import { languageLabels } from "../../utils/botLanguages.js";
import { participantUnit, tournamentScheduleLines } from "../../utils/tournamentApi.js";
import { TOUR_STATUS } from "../../utils/tournamentStatus.js";

// ─────────────────────────────────────────────────────────────
// Danh sách giải đấu của tôi (kèm nút mở giải mới).
// ─────────────────────────────────────────────────────────────
export default function MyTournamentsSection({
  tournaments,
  createOpen,
  onToggleCreate,
  onOpenTournament,
  onEditWindow,
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0 }}>Giải đấu của tôi ({tournaments.length})</h3>
        <button className="btn small primary" onClick={onToggleCreate}>
          {createOpen ? "← Đóng" : "➕ Mở giải mới"}
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)" }}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>📜</div>
          <p>Bạn chưa mở giải đấu nào.</p>
          <button className="btn primary" onClick={onToggleCreate}>
            Tạo giải đấu đầu tiên ngay!
          </button>
        </div>
      ) : (
        tournaments.map((t) => (
          <div key={t.id} className="tour-item-card">
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--text)" }}>
                {t.name}
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>
                  {t.code}
                </span>
              </h4>
              <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span>🎮 Game: {t.gameName}</span>
                <span>
                  👥 {t.registered}
                  {t.capacity ? `/${t.capacity}` : ""} {participantUnit(t.participantMode)}
                </span>
                {t.languages?.length > 0 && <span>🌐 {languageLabels(t.languages)}</span>}
              </div>
              <div className="tour-card-schedule">
                {tournamentScheduleLines(t).map((line) => (
                  <span key={line.label}>
                    {line.icon} {line.label}: <b>{line.value}</b>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`tour-status-badge ${TOUR_STATUS[t.status]?.className ?? "upcoming"}`}>
                {TOUR_STATUS[t.status]?.label ?? t.status}
              </span>
              {t.status === "open" && (
                <button
                  className="btn small"
                  title="Đổi ngày mở đơn và đóng đơn"
                  onClick={() => onEditWindow?.(t)}
                >
                  📅 Sửa mở/đóng đơn
                </button>
              )}
              <button className="btn small" onClick={() => onOpenTournament?.(t.id)}>
                Vào phòng chờ
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}