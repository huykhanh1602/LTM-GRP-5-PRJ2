import { useState } from "react";
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from "../config.js";

function randomCode() {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return s;
}

// Trang đầu: nhập tên đội + tạo phòng / vào phòng bằng mã / chỉ xem.
export default function Lobby({ onJoin, onCancel, connecting, queue, error }) {
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");

  function go(roomCode, role, create = false) {
    if (role === "player" && !teamName.trim()) return setProblem("Hãy nhập tên đội.");
    if (!roomCode.trim()) return setProblem("Hãy nhập mã phòng.");
    setProblem("");
    onJoin({ code: roomCode.trim().toUpperCase(), teamName: teamName.trim(), role, create });
  }

  // Ghép trận tự động: server tự tạo phòng khi tìm được đối thủ.
  function findMatch() {
    if (!teamName.trim()) return setProblem("Hãy nhập tên đội.");
    setProblem("");
    onJoin({ find: true, mode: "casual", code: randomCode(), teamName: teamName.trim(), role: "player" });
  }

  return (
    <div className="lobby">
      <div className="card lobby-card">
        <h2>Vào phòng đấu</h2>

        <label className="field">
          Tên đội
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={30}
            placeholder="Ví dụ: Naruto Team"
            disabled={connecting}
          />
        </label>

        <div className="lobby-actions">
          <button className="btn primary" disabled={connecting} onClick={findMatch}>
            Tìm trận nhanh
          </button>
          <button className="btn" disabled={connecting} onClick={() => go(randomCode(), "player", true)}>
            Tạo phòng mới
          </button>
        </div>

        <div className="or">hoặc vào phòng có sẵn</div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="Mã phòng"
            disabled={connecting}
            onKeyDown={(e) => e.key === "Enter" && go(code, "player")}
          />
          <button className="btn" disabled={connecting} onClick={() => go(code, "player")}>
            Vào phòng
          </button>
          <button className="btn spectate" disabled={connecting} onClick={() => go(code, "spectator")} title="Xem mà không tham gia">
            Chỉ xem
          </button>
        </div>

        {queue && (
          <p className="hint" role="status">
            Đang tìm đối thủ… {queue.wait_time}s{" "}
            <button className="btn small" onClick={onCancel}>Hủy</button>
          </p>
        )}
        {connecting && !queue && <p className="hint">Đang kết nối…</p>}
        {(problem || error) && <p className="err">{problem || error}</p>}
      </div>
    </div>
  );
}
