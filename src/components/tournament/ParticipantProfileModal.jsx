import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { getUserProfile } from "../../api.js";
import { apiErrorText, formatStartsAt } from "../../utils/tournamentApi.js";
import { STATUS_BADGE } from "../../utils/tournamentStatus.js";

// ─────────────────────────────────────────────────────────────
// Trang cá nhân công khai của một người tham gia giải
// ─────────────────────────────────────────────────────────────
export default function ParticipantProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    getUserProfile(userId)
      .then((data) => active && setProfile(data))
      .catch((err) => active && setError(apiErrorText(err)));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <Modal title="Trang cá nhân" onClose={onClose}>
      {error && <p className="err">{error}</p>}
      {!profile && !error && <p className="muted">Đang tải…</p>}
      {profile && (
        <div className="tl-profile">
          <div className="tl-profile__head">
            <img src={profile.avatar_url || "/icons.png"} alt="" />
            <div>
              <strong>{profile.display_name}</strong>
              <small>Tham gia từ {formatStartsAt(profile.created_at)}</small>
            </div>
          </div>

          <div className="tl-profile__stats">
            <span>
              Trận đã đấu<b>{profile.stats.played}</b>
            </span>
            <span>
              Thắng<b>{profile.stats.wins}</b>
            </span>
            <span>
              Hòa<b>{profile.stats.draws}</b>
            </span>
            <span>
              Thua<b>{profile.stats.losses}</b>
            </span>
          </div>

          <h3>Giải đấu đã tham gia</h3>
          {profile.tournaments.length === 0 ? (
            <p className="muted">Chưa tham gia giải đấu nào.</p>
          ) : (
            <ul className="tl-profile__tours">
              {profile.tournaments.map((row) => (
                <li key={row.id}>
                  <span>{row.name}</span>
                  <small>
                    {STATUS_BADGE[row.status]?.label ?? row.status} · {formatStartsAt(row.starts_at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}