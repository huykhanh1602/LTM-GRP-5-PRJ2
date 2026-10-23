import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import {
  addTeamMember,
  createBotSubmission,
  createTeam,
  getBotSubmissions,
  registerTournamentTeam,
} from "../../api.js";
import { apiErrorText, formatStartsAt } from "../../utils/tournamentApi.js";

// ─────────────────────────────────────────────────────────────
// Đăng ký Đội: đặt tên Đội, mời thành viên (có thể trống),
// chọn Bot Submission hoặc nhập code trực tiếp.
// Hành vi thay đổi theo roundSubmissionMode:
//   SINGLE   → cho phép chọn bot cũ hoặc nhập code mới
//   PER_ROUND→ ẩn hoàn toàn phần bot (nộp sau theo vòng)
// ─────────────────────────────────────────────────────────────
export default function TeamRegistrationModal({ tournament, user, token, onClose, onRegistered }) {
  const roundSubmissionMode = tournament.roundSubmissionMode ?? "SINGLE";
  const isSingleMode = roundSubmissionMode === "SINGLE";
  const isPerRoundMode = roundSubmissionMode === "PER_ROUND";

  const [roomCode, setRoomCode] = useState(tournament.code ?? "");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState("");
  const [submissions, setSubmissions] = useState(null);
  const [pickedSubmissionId, setPickedSubmissionId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Code trực tiếp (SINGLE mode)
  const [botCode, setBotCode] = useState("");
  const [botFilename, setBotFilename] = useState("mybot.py");
  const [subFetchFailed, setSubFetchFailed] = useState(false);

  // ── Tải danh sách Bot Submission (chỉ ở SINGLE mode) ──
  useEffect(() => {
    if (!isSingleMode) return;
    let active = true;
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setSubmissions([]);
      setSubFetchFailed(false);
      return undefined;
    }
    setSubmissions(null);
    setSubFetchFailed(false);
    getBotSubmissions(code, token, { limit: 50 })
      .then((data) => {
        if (!active) return;
        setSubmissions(data.items ?? []);
        setSubFetchFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setSubmissions([]);
        setSubFetchFailed(true); // 404 / lỗi → hiện textarea
      });
    return () => { active = false; };
  }, [roomCode, token, isSingleMode]);

  // ── Đăng ký ──
  async function submit() {
    if (!teamName.trim()) {
      setError("Đặt tên Đội trước đăng ký tham gia.");
      return;
    }
    if (isSingleMode && !pickedSubmissionId && !botCode.trim()) {
      setError("Chọn Bot Submission hoặc nhập code bot.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1) Tạo Đội
      const team = await createTeam(teamName.trim(), token);
      // 2) Mời thành viên
      const invited = members.split(",").map((m) => m.trim()).filter(Boolean);
      for (const userId of invited) {
        try { await addTeamMember(team.id, userId, token); } catch { /* bỏ qua */ }
      }
      // 3) Xác định submissionId
      let submissionId = pickedSubmissionId;
      if (isSingleMode && !submissionId && botCode.trim()) {
        // Thử tạo submission từ code nhập trực tiếp
        try {
          const created = await createBotSubmission(
            roomCode.trim().toUpperCase(),
            botFilename.trim() || "mybot.py",
            botCode,
            token,
          );
          submissionId = created.id;
        } catch {
          // Không tạo được → đăng ký không có submission (nộp sau)
        }
      }
      // 4) Đăng ký giải
      onRegistered(await registerTournamentTeam(tournament.id, team.id, token, submissionId));
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──
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

      {/* ─── Tên Đội ─── */}
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

      {/* ─── Thành viên ─── */}
      <label className="tl-form-label" htmlFor="tl-team-members">
        Thành viên (phân cách dấu phẩy, có thể để trống)
      </label>
      <input
        id="tl-team-members"
        className="tl-form-input"
        value={members}
        onChange={(event) => setMembers(event.target.value)}
        placeholder="user1, user2, …"
      />

      {/* ─── Bot Submission ─── */}
      {isSingleMode && (
        <>
          {/* Mã phòng đấu (để tải bot cũ) */}
          <label className="tl-form-label" htmlFor="tl-team-room">
            Mã phòng đấu (để tải Bot Submission cũ)
          </label>
          <input
            id="tl-team-room"
            className="tl-form-input"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={4}
          />

          {/* Danh sách Bot cũ hoặc textarea nhập code mới */}
          {submissions === null ? (
            <p className="muted">Đang tải Bot Submission…</p>
          ) : submissions.length > 0 && !subFetchFailed ? (
            <>
              <div className="tl-form-label">Bot Submission đại diện cho Đội <b className="tl-form-req">*</b></div>
              <ul className="tl-match-picker">
                {submissions.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="radio"
                        name="tl-team-submission"
                        checked={pickedSubmissionId === item.id}
                        onChange={() => { setPickedSubmissionId(item.id); setBotCode(""); }}
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
              <p className="tl-form-note">— hoặc nhập code mới bên dưới —</p>
            </>
          ) : (
            <p className="muted">
              {subFetchFailed
                ? "Không thể tải Bot Submission từ phòng đấu. Hãy nhập code trực tiếp bên dưới."
                : "Chưa có Bot Submission cũ. Nhập code trực tiếp bên dưới."}
            </p>
          )}

          {/* Textarea nhập code bot trực tiếp + nút upload file */}
          <label className="tl-form-label" htmlFor="tl-bot-code">
            Code Bot <b className="tl-form-req">*</b>
            <small style={{ fontWeight: "normal", marginLeft: 8 }}>
              (hoặc chọn bot cũ ở trên)
            </small>
          </label>
          <textarea
            id="tl-bot-code"
            className="tl-form-input tl-code-input"
            value={botCode}
            onChange={(event) => { setBotCode(event.target.value); if (event.target.value.trim()) setPickedSubmissionId(null); }}
            placeholder="# Paste code bot Python của bạn vào đây …"
            rows={10}
            style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre", overflowWrap: "off" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>
              Tên file:
              <input
                type="text"
                value={botFilename}
                onChange={(e) => setBotFilename(e.target.value)}
                style={{ width: 160, marginLeft: 6, fontFamily: "monospace" }}
                placeholder="mybot.py"
              />
            </label>
            <input
              type="file"
              accept=".py,.txt,.js,.cpp,.jsx,.ts,.tsx"
              style={{ display: "none" }}
              id="tl-bot-file-picker"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBotFilename(file.name);
                file.text().then((text) => {
                  setBotCode(text);
                  setPickedSubmissionId(null);
                });
              }}
            />
            <button
              type="button"
              className="btn"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => document.getElementById("tl-bot-file-picker")?.click()}
            >
              📂 Chọn file .py
            </button>
          </div>
        </>
      )}

      {isPerRoundMode && (
        <p className="tl-form-note" style={{ marginTop: 12 }}>
          📌 Giải đấu theo chế độ nộp bot theo vòng (PER_ROUND).
          Bot sẽ được nộp sau khi giải khởi tranh, không cần chọn bot ngay bây giờ.
        </p>
      )}

      {/* ─── Bảng xác nhận ─── */}
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
          {isSingleMode && (
            <tr>
              <th scope="row">Bot đại diện</th>
              <td>
                {pickedSubmissionId
                  ? (submissions?.find((s) => s.id === pickedSubmissionId)?.filename ?? <em>đã chọn</em>)
                  : botCode.trim()
                    ? <code>{botFilename.trim() || "mybot.py"}</code>
                    : <em>chưa chọn</em>}
              </td>
            </tr>
          )}
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