import { languageLabels } from "../../utils/botLanguages.js";
import { participantUnit, tournamentScheduleLines } from "../../utils/tournamentApi.js";
import { TOUR_STATUS } from "../../utils/tournamentStatus.js";

// ─────────────────────────────────────────────────────────────
// Hai nhóm giải trong trang cá nhân: giải tôi tổ chức và giải tôi tham gia.
// ─────────────────────────────────────────────────────────────
function TournamentRow({ tournament: t, isOrganizer, onOpenTournament, onEditWindow }) {
  return (
    <div className="tour-item-card">
      <div>
        <h4 className="tour-item-card__title">
          {t.name}
          <span className="tour-item-card__code">{t.code}</span>
        </h4>
        <div className="tour-item-card__meta">
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
      <div className="tour-item-card__actions">
        <span className={`tour-status-badge ${TOUR_STATUS[t.status]?.className ?? "upcoming"}`}>
          {TOUR_STATUS[t.status]?.label ?? t.status}
        </span>
        {isOrganizer && t.status === "open" && (
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
  );
}

function TournamentGroup({ title, hint, tournaments, isOrganizer, action, onOpenTournament, onEditWindow }) {
  return (
    <section className="profile-tour-group">
      <div className="profile-tour-group__head">
        <div>
          <h3>{title} ({tournaments.length})</h3>
          {hint && <p>{hint}</p>}
        </div>
        {action}
      </div>

      {tournaments.length === 0 ? (
        <p className="profile-tour-empty">📭 {isOrganizer ? "Bạn chưa mở giải đấu nào." : "Bạn chưa tham gia giải đấu nào."}</p>
      ) : (
        tournaments.map((t) => (
          <TournamentRow
            key={t.id}
            tournament={t}
            isOrganizer={isOrganizer}
            onOpenTournament={onOpenTournament}
            onEditWindow={onEditWindow}
          />
        ))
      )}
    </section>
  );
}

export default function MyTournamentsSection({
  organized = [],
  joined = [],
  onCreate,
  onOpenTournament,
  onEditWindow,
}) {
  return (
    <div className="profile-tour-groups">
      <TournamentGroup
        title="Giải tôi tổ chức"
        hint="Bạn là chủ giải, toàn quyền mở vòng và xếp lịch."
        tournaments={organized}
        isOrganizer
        action={
          <button className="btn small primary" onClick={onCreate}>
            ➕ Mở giải mới
          </button>
        }
        onOpenTournament={onOpenTournament}
        onEditWindow={onEditWindow}
      />

      <TournamentGroup
        title="Giải tôi tham gia"
        hint="Giải có đơn đăng ký của bạn hoặc của đội bạn là thành viên."
        tournaments={joined}
        onOpenTournament={onOpenTournament}
      />
    </div>
  );
}
