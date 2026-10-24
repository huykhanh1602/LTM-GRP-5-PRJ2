import { useEffect, useState } from "react";
import { getTeam, removeTeamMember, searchUsers, sendPlayerInvitation } from "../../api.js";
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
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let active = true;
    if (!teamId) return undefined;
    getTeam(teamId, token).then((data) => active && setTeam(data)).catch(() => {});
    return () => { active = false; };
  }, [teamId, token]);

  useEffect(() => {
    const term = memberQuery.trim();
    if (term.length < 2) { setMemberSuggestions([]); setSearchingMembers(false); return undefined; }
    let active = true; setSearchingMembers(true);
    const timer = window.setTimeout(() => searchUsers(term)
      .then(data => { if (active) setMemberSuggestions((data.items ?? []).filter(candidate => !candidate.guest && String(candidate.id) !== String(user?.id))); })
      .catch(() => { if (active) setMemberSuggestions([]); })
      .finally(() => { if (active) setSearchingMembers(false); }), 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [memberQuery, user?.id]);

  if (!teamId) return null;

  const isCaptain = team?.members?.some((m) => m.user_id === user?.id && m.role === "captain") ?? false;
  const status = tournament.status; // draft, open, in_progress, completed, cancelled
  const isEditable = status === "draft" || status === "open";

  async function inviteMember(candidate) {
    setBusy(true);
    setMsg(null);
    try {
      await sendPlayerInvitation({ type: "team", recipient_id: candidate.id, team_id: teamId }, token);
      setMemberQuery(""); setMemberSuggestions([]);
      setMsg({ tone: "ok", text: `Đã gửi lời mời cho ${candidate.display_name}. Họ sẽ được thêm sau khi chấp nhận.` });
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
            placeholder="Tìm người chơi theo tên tài khoản để mời"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
          />
          {memberQuery.trim().length >= 2 && <ul className="tl-member-suggest">
            {searchingMembers && <li className="muted">Đang tìm…</li>}
            {!searchingMembers && !memberSuggestions.length && <li className="muted">Không tìm thấy người chơi.</li>}
            {!searchingMembers && memberSuggestions.map(candidate => <li key={candidate.id}><button type="button" disabled={busy || team?.members?.some(member => String(member.user_id) === String(candidate.id))} onClick={() => inviteMember(candidate)}>
              <img src={candidate.avatar_url || "/icons.png"} alt="" /><span>{candidate.display_name}</span><small>{team?.members?.some(member => String(member.user_id) === String(candidate.id)) ? "Đã ở trong đội" : "Mời vào đội"}</small>
            </button></li>)}
          </ul>}
        </div>
      )}

      {!isEditable && (
        <p className="muted">🔒 Giải đã khởi tranh — danh sách thành viên chỉ đọc.</p>
      )}

      {msg && <p className={msg.tone === "ok" ? "ok" : "err"}>{msg.text}</p>}
    </section>
  );
}
