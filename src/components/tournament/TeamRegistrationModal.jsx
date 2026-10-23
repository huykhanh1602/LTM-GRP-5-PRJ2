import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { addTeamMember, createTeam, registerTournamentTeam, searchUsers } from "../../api.js";
import { apiErrorText } from "../../utils/tournamentApi.js";

// Đăng ký Đội: tên Đội + mời đồng đội (gõ để tìm nick). Không nộp code ở đây.
export default function TeamRegistrationModal({ tournament, user, token, onClose, onRegistered }) {
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Gõ ≥2 ký tự → debounce rồi gọi API tìm nick.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    let active = true;
    const timer = setTimeout(() => {
      searchUsers(term)
        .then((data) => { if (active) setSuggestions(data.items ?? []); })
        .catch(() => { if (active) setSuggestions([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  function addMember(candidate) {
    if (!members.some((m) => String(m.id) === String(candidate.id))) {
      setMembers((prev) => [...prev, candidate]);
    }
    setQuery("");
    setSuggestions([]);
    inputRef.current?.focus();
  }

  async function submit() {
    if (!teamName.trim()) {
      setError("Đặt tên Đội trước đăng ký tham gia.");
      return;
    }
    const memberCount = members.length + 1;
    if (memberCount < (tournament.minTeamSize ?? 1)) {
      setError(`Đội cần tối thiểu ${tournament.minTeamSize} thành viên (tính cả đội trưởng).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const team = await createTeam(teamName.trim(), token);
      for (const member of members) {
        try { await addTeamMember(team.id, member.id, token); } catch { /* nick không còn tồn tại → bỏ qua */ }
      }
      onRegistered(await registerTournamentTeam(tournament.id, team.id, token));
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
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Đang đăng ký…" : "✔ Đăng ký Đội"}
          </button>
        </>
      }
    >
      {error && <p className="err">{error}</p>}

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

      <label className="tl-form-label" htmlFor="tl-member-input">
        Đồng đội <small style={{ fontWeight: "normal" }}>(gõ tên nick để tìm và thêm)</small>
      </label>
      <div className="tl-member-chips">
        {members.map((member) => (
          <span key={member.id} className="tl-chip">
            <img src={member.avatar_url || "/icons.png"} alt="" />
            {member.display_name}
            <button
              type="button"
              aria-label={`Xóa ${member.display_name}`}
              onClick={() => setMembers((prev) => prev.filter((m) => String(m.id) !== String(member.id)))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="tl-member-search">
        <input
          ref={inputRef}
          id="tl-member-input"
          className="tl-form-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ví dụ: nguyen…"
          autoComplete="off"
        />
        {query.trim().length >= 2 && (
          <ul className="tl-member-suggest">
            {searching && <li className="muted">Đang tìm…</li>}
            {!searching && suggestions.length === 0 && <li className="muted">Không tìm thấy nick nào.</li>}
            {!searching && suggestions.map((candidate) => (
              <li key={candidate.id}>
                <button type="button" onClick={() => addMember(candidate)}>
                  <img src={candidate.avatar_url || "/icons.png"} alt="" />
                  <span>{candidate.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <table className="tl-team-confirm">
        <caption>Bảng xác nhận lập Đội</caption>
        <tbody>
          <tr><th scope="row">Tên Đội</th><td>{teamName.trim() || <em>chưa đặt</em>}</td></tr>
          <tr><th scope="row">Đội trưởng</th><td>{user?.display_name ?? "Bạn"}</td></tr>
          <tr>
            <th scope="row">Số thành viên</th>
            <td>{members.length + 1} ({tournament.minTeamSize}–{tournament.maxTeamSize} người)</td>
          </tr>
        </tbody>
      </table>

      <p className="tl-form-note" style={{ marginTop: 12 }}>
        📌 Bot của Đội sẽ nộp sau (lúc đăng ký giải đơn hoặc theo từng vòng sau khi khởi tranh),
        không nhập code ở đây.
      </p>
    </Modal>
  );
}
