import { useEffect, useState } from "react";
import { addTeamMember, getTeam, removeTeamMember } from "../../api.js";
import { apiErrorText } from "../../utils/tournamentApi.js";

// ─────────────────────────────────────────────────────────────
// Đội của tôi: đội trưởng xem/thêm/xóa thành viên.
// Bot đại diện được quản lý qua luồng nộp code thi đấu (TopMatchBanner / Room).
// ─────────────────────────────────────────────────────────────
export default function TeamManagementPanel({ tournament, user, token, onUpdated }) {
  const entry = (tournament.raw?.entries ?? []).find(
    (item) => item.team_id && String(item.user_id) === String(user?.id),
  );
  const teamId = entry?.team_id ?? null;
  const [team, setTeam] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let active = true;
    if (!teamId) return undefined;
    getTeam(teamId, token).then((data) => active && setTeam(data)).catch(() => {});
    return () => { active = false; };
  }, [teamId, token]);

  if (!teamId) return null;

  const isCaptain = team?.members?.some((m) => m.user_id === user?.id && m.role === "captain") ?? false;
  const status = tournament.status; // draft, open, in_progress, completed, cancelled
  const isEditable = status === "draft" || status === "open";

  async function addMember() {
    if (!memberId.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await addTeamMember(teamId, memberId.trim(), token);
      setTeam(await getTeam(teamId, token));
      setMemberId("");
      setMsg({ tone: "ok", text: "Đã thêm thành viên vào Đội." });
    } catch (err) {
      setMsg({ tone: "err", text: apiErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function kickMember(userId) {
    if (!confirm("Xóa thành viên này khỏi đội?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await removeTeamMember(teamId, userId, token);
      setTeam(await getTeam(teamId, token));
      setMsg({ tone: "ok", text: "Đã xóa thành viên khỏi Đội." });
    } catch (err) {
      setMsg({ tone: "err", text: apiErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tl-card tl-team-panel" aria-label="Đội của tôi">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">👥 Đội của tôi</h2>
          <p className="tl-card__desc">Đội: <strong>{team?.name ?? teamId}</strong></p>
        </div>
      </header>

      <ul className="tl-team-members">
        {(team?.members ?? []).map((member) => (
          <li key={member.user_id}>
            {member.display_name ?? member.user_id}
            {" · "}
            <small>{member.role === "captain" ? "Đội trưởng" : "Thành viên"}</small>
            {isEditable && isCaptain && member.role !== "captain" && (
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => kickMember(member.user_id)}
                title="Xóa thành viên khỏi đội"
              >
                ✕ Xóa
              </button>
            )}
          </li>
        ))}
      </ul>

      {isEditable && isCaptain && (
        <div className="tl-team-actions">
          <input
            className="tl-form-input"
            placeholder="user_id thành viên muốn mời"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
          />
          <button type="button" className="btn small" disabled={busy} onClick={addMember}>
            ➕ Thêm thành viên
          </button>
        </div>
      )}

      {!isEditable && (
        <p className="muted">🔒 Giải đã khởi tranh — danh sách thành viên chỉ đọc.</p>
      )}

      {msg && <p className={msg.tone === "ok" ? "ok" : "err"}>{msg.text}</p>}
    </section>
  );
}