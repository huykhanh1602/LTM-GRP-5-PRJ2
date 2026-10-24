import { useEffect, useRef, useState } from "react";
import { addTeamMember, createBotSubmission, getTeam, setEntrySubmission } from "../../api.js";
import { apiErrorText } from "../../utils/tournamentApi.js";
import { BOT_LANGUAGES } from "../../utils/botLanguages.js";

// ─────────────────────────────────────────────────────────────
// Đội của tôi: đội trưởng xem/thêm thành viên và đổi Bot đại diện
// bằng cách dán code trực tiếp hoặc tải file `.py` lên.
// ─────────────────────────────────────────────────────────────
export default function TeamManagementPanel({ tournament, user, token, onUpdated }) {
  const entry = (tournament.raw?.entries ?? []).find(
    (item) => item.team_id && String(item.user_id) === String(user?.id),
  );
  const teamId = entry?.team_id ?? null;
  const fileRef = useRef(null);
  const [team, setTeam] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [source, setSource] = useState("");
  const [filename, setFilename] = useState("bot.py");
  const [language, setLanguage] = useState("python");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let active = true;
    if (!teamId) return undefined;
    getTeam(teamId, token).then((data) => active && setTeam(data)).catch(() => {});
    return () => { active = false; };
  }, [teamId, token]);

  if (!teamId) return null;

  const extensionMap = {
    py: "python",
    js: "javascript",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    java: "java",
  };

  function handleFilePick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const detectedLang = extensionMap[ext] ?? "python";
    setLanguage(detectedLang);
    const reader = new FileReader();
    reader.onload = (e) => setSource(e.target.result);
    reader.readAsText(file);
  }

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
    setBusy(true);
    setMsg(null);
    try {
      const sub = await createBotSubmission(tournament.code, filename, source, token);
      const submissionId = sub.id ?? sub.submission_id;
      await setEntrySubmission(tournament.id, { teamId, submissionId }, token);
      onUpdated?.();
      setMsg({ tone: "ok", text: "✅ Bot đại diện đã được cập nhật." });
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

      <div className="tl-form-label">🤖 Bot đại diện</div>

      <div className="tl-bot-row">
        <input
          className="tl-form-input"
          placeholder="Tên file, ví dụ: bot.py"
          value={filename}
          onChange={(e) => {
            setFilename(e.target.value);
            const ext = e.target.value.split(".").pop()?.toLowerCase();
            if (extensionMap[ext]) setLanguage(extensionMap[ext]);
          }}
        />
        <button
          type="button"
          className="btn small"
          onClick={() => fileRef.current?.click()}
        >
          📂 Chọn file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".py,.js,.cpp,.cc,.cxx,.java"
          style={{ display: "none" }}
          onChange={handleFilePick}
        />
      </div>

      <select
        className="tl-form-input"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        {BOT_LANGUAGES.map((lang) => (
          <option key={lang.id} value={lang.id}>{lang.label}</option>
        ))}
      </select>

      <textarea
        className="tl-bot-textarea"
        rows={12}
        placeholder={'# Dán code bot Python (hoặc chọn file ở trên)\ndef my_move(state):\n    return "R"'}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
      />

      <button
        type="button"
        className="btn small primary"
        disabled={busy || !source.trim()}
        onClick={saveSubmission}
      >
        💾 Lưu Bot đại diện
      </button>

      {msg && <p className={msg.tone === "ok" ? "ok" : "err"}>{msg.text}</p>}
    </section>
  );
}