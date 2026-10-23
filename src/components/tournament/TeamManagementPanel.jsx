import { useEffect, useState } from "react";
import { addTeamMember, getBotSubmissions, getTeam, setEntrySubmission } from "../../api.js";
import { apiErrorText } from "../../utils/tournamentApi.js";

// ─────────────────────────────────────────────────────────────
// Đội của tôi: đội trưởng xem/thêm thành viên và đổi Bot Submission
// đại diện trước khi giải khởi tranh.
// ─────────────────────────────────────────────────────────────
export default function TeamManagementPanel({ tournament, user, token, onUpdated }) {
  const entry = (tournament.raw?.entries ?? []).find(
    (item) => item.team_id && String(item.user_id) === String(user?.id),
  );
  const teamId = entry?.team_id ?? null;
  const [team, setTeam] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [submissionId, setSubmissionId] = useState(entry?.bot_submission_id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let active = true;
    if (!teamId) return undefined;
    getTeam(teamId, token).then((data) => active && setTeam(data)).catch(() => {});
    return () => { active = false; };
  }, [teamId, token]);

  useEffect(() => {
    let active = true;
    if (!tournament.code) return undefined;
    getBotSubmissions(tournament.code, token, { limit: 50 })
      .then((data) => active && setSubmissions(data.items ?? []))
      .catch(() => active && setSubmissions([]));
    return () => { active = false; };
  }, [tournament.code, token]);

  if (!teamId) return null;

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

  async function saveSubmission() {
    if (!submissionId) return;
    setBusy(true);
    setMsg(null);
    try {
      await setEntrySubmission(tournament.id, { teamId, submissionId }, token);
      onUpdated?.();
      setMsg({ tone: "ok", text: "Đã đổi Bot Submission đại diện cho Đội." });
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
          </li>
        ))}
      </ul>

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

      <div className="tl-form-label">Bot Submission đại diện cho Đội</div>
      <select
        className="tl-form-input"
        value={submissionId}
        onChange={(event) => setSubmissionId(event.target.value)}
      >
        <option value="">— chọn bot đại diện —</option>
        {submissions.map((item) => (
          <option key={item.id} value={item.id}>{item.filename}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn small primary"
        disabled={busy || !submissionId}
        onClick={saveSubmission}
      >
        💾 Lưu bot đại diện
      </button>

      {msg && <p className={msg.tone === "ok" ? "ok" : "err"}>{msg.text}</p>}
    </section>
  );
}