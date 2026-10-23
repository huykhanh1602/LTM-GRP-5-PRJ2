import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import {
  addTeamMember,
  createTeam,
  getBotSubmissions,
  registerTournamentTeam,
} from "../../api.js";
import { apiErrorText, formatStartsAt } from "../../utils/tournamentApi.js";

// ─────────────────────────────────────────────────────────────
// Đăng ký Đội: đặt tên Đội, mời thành viên (có thể trống),
// chọn Bot Submission đại diện dla Đội, rồi đăng ký với team_id.
// ─────────────────────────────────────────────────────────────
export default function TeamRegistrationModal({ tournament, user, token, onClose, onRegistered }) {
  const [roomCode, setRoomCode] = useState(tournament.code ?? "");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState("");
  const [submissions, setSubmissions] = useState(null);
  const [pickedSubmissionId, setPickedSubmissionId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setSubmissions([]);
      return undefined;
    }
    setSubmissions(null);
    getBotSubmissions(code, token, { limit: 50 })
      .then((data) => active && setSubmissions(data.items ?? []))
      .catch(() => active && setSubmissions([]));
    return () => {
      active = false;
    };
  }, [roomCode, token]);

  async function submit() {
    if (!teamName.trim()) {
      setError("Đặt tên Đội trước đăng ký tham gia.");
      return;
    }
    if (!pickedSubmissionId) {
      setError("Chọn Bot Submission đại diện dla Đội.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1) Lập Đội (người đăng ký trở thành đội trưởng).
      const team = await createTeam(teamName.trim(), token);
      // 2) Mời thêm thành viên (nhập user_id, phân tách dấu phẩy).
      const invited = members.split(",").map((m) => m.trim()).filter(Boolean);
      for (const userId of invited) {
        try { await addTeamMember(team.id, userId, token); } catch { /* bỏ qua thành viên lỗi */ }
      }
      // 3) Đăng ký giải với team_id thật + bot đại diện.
      onRegistered(await registerTournamentTeam(tournament.id, team.id, token, pickedSubmissionId));
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Tạo Đội / Chọn Đội"
      subtitle={`${tournament.name} · chế độ Đội (${tournament.minTeamSize}–${tournament.maxTeamSize} người)`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={submit}
          >
            {busy ? "Đang đăng ký…" : "✔ Đăng ký Đội"}
          </button>
        </>
      }
    >
      {error && <p className="err">{error}</p>}

      <label className="tl-form-label" htmlFor="tl-team-room">
        Mã phòng đấu (để tải Bot Submission của bạn)
      </label>
      <input
        id="tl-team-room"
        className="tl-form-input"
        value={roomCode}
        onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
        placeholder="ABCD"
        maxLength={4}
      />

      <label className="tl-form-label" htmlFor="tl-team-name">
        Tên Đội <b className="tl-form-req">*</b>
      </label>
      <input
        id="tl-team-name"
        className="tl-form-input"
        value={teamName}
        onChange={(event) => setTeamName(event.target.value)}
        placeholder="Đội Rồng"
        maxLength={60}
      />

      <label className="tl-form-label" htmlFor="tl-team-members">
        Thành viên (phân dấu dấu, có thể để trống)
      </label>
      <input
        id="tl-team-members"
        className="tl-form-input"
        value={members}
        onChange={(event) => setMembers(event.target.value)}
        placeholder="user1, user2, …"
      />

      <div className="tl-form-label">Bot Submission đại diện dla Đội <b className="tl-form-req">*</b></div>
      {submissions === null ? (
        <p className="muted">Đang tải Bot Submission…</p>
      ) : submissions.length === 0 ? (
        <p className="muted">
          Không tìm thấy Bot Submission dla mã phòng này. Nộp bot trước trong phòng đấu rồi thử lại.
        </p>
      ) : (
        <ul className="tl-match-picker">
          {submissions.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="radio"
                  name="tl-team-submission"
                  checked={pickedSubmissionId === item.id}
                  onChange={() => setPickedSubmissionId(item.id)}
                />
                <span>
                  <strong>{item.filename}</strong>
                  <small>
                    Đội: <code>{item.team_id}</code> · {formatStartsAt(item.created_at)}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <table className="tl-team-confirm">
        <caption>Bảng xác nhận lập Đội</caption>
        <tbody>
          <tr><th scope="row">Tên Đội</th><td>{teamName.trim() || <em>chưa đặt</em>}</td></tr>
          <tr>
            <th scope="row">Đội trưởng</th>
            <td>{user?.display_name ?? "Bạn"}</td>
          </tr>
          <tr>
            <th scope="row">Số thành viên</th>
            <td>{members.split(",").map((m) => m.trim()).filter(Boolean).length + 1}
              {" "}({tournament.minTeamSize}–{tournament.maxTeamSize} người)
            </td>
          </tr>
          <tr>
            <th scope="row">Bot đại diện</th>
            <td>{submissions?.find((s) => s.id === pickedSubmissionId)?.filename ?? <em>chưa chọn</em>}</td>
          </tr>
        </tbody>
      </table>
      {members.trim() && (
        <p className="tl-form-note">
          👥 Thành viên: {members.split(",").map((m) => m.trim()).filter(Boolean).join(", ")}
        </p>
      )}
    </Modal>
  );
}