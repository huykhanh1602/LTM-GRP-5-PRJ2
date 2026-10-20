import { useState, useEffect } from "react";
import { GAME_CATALOG } from "../games/catalog.js";
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from "../config.js";

// Thứ tự hiển thị tab chế độ
const MODE_ORDER = ["casual", "ranked", "tournament"];

function randomCode() {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return s;
}

// ─────────────────────────────────────────────────────────────
// GameLobby — Sảnh chờ cho một game cụ thể, có 3 chế độ chơi
// ─────────────────────────────────────────────────────────────
export default function GameLobby({
  gameId = "rps_chess",
  onJoin,
  onCancel,
  onBack,
  connecting,
  queue,
  error,
  user,
  onOpenLogin,
  onGoProfile,
}) {
  const game = GAME_CATALOG.find((g) => g.id === gameId) ?? GAME_CATALOG[0];

  const firstEnabled =
    MODE_ORDER.find((m) => game.modes[m]?.enabled) ?? "casual";
  const [mode, setMode] = useState(firstEnabled);
  const [teamName, setTeamName] = useState(user?.display_name || "");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");

  // Tự động điền tên người dùng nếu vừa đăng nhập
  useEffect(() => {
    if (user?.display_name && !teamName) {
      setTeamName(user.display_name);
    }
  }, [user]);

  const modeCfg = game.modes[mode] ?? {};

  // ── Actions ──────────────────────────────────────────────
  function findMatch() {
    if (!teamName.trim()) return setProblem("Hãy nhập tên đội hoặc bot của bạn.");
    setProblem("");
    onJoin({
      find: true,
      mode,
      gameId: game.id,
      code: randomCode(),
      teamName: teamName.trim(),
      role: "player",
    });
  }

  function joinRoom(roomCode, role, create = false) {
    if (role === "player" && !teamName.trim())
      return setProblem("Hãy nhập tên đội.");
    if (!roomCode.trim()) return setProblem("Hãy nhập mã phòng.");
    setProblem("");
    onJoin({
      code: roomCode.trim().toUpperCase(),
      teamName: teamName.trim(),
      role,
      create,
      mode,
      gameId: game.id,
    });
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="game-lobby">
      {/* Header: logo + tên game */}
      <div className="game-lobby__header">
        <div className="game-lobby__game-info">
          <img
            src={game.icon ?? game.cover}
            alt={game.name}
            className="game-lobby__icon"
          />
          <h2 className="game-lobby__name">{game.name}</h2>
        </div>
      </div>

      {/* Tab chọn chế độ */}
      <div className="mode-tabs" role="tablist">
        {MODE_ORDER.map((m) => {
          const cfg = game.modes[m];
          if (!cfg) return null;
          const active = mode === m;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              className={[
                "mode-tab",
                active ? "mode-tab--active" : "",
                !cfg.enabled ? "mode-tab--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setMode(m);
                setProblem("");
              }}
              title={cfg.desc}
            >
              <span className="mode-tab__label">{cfg.label}</span>
              <span className={`mode-tab__badge mode-tab__badge--${m}`}>
                {m}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mô tả chế độ hiện tại */}
      <p className="mode-desc" role="status">
        {modeCfg.desc}
      </p>

      {/* Nội dung: form hoặc thông báo */}
      <div className="card lobby-card">
        {mode === "tournament" ? (
          /* ── Chế độ Giải Đấu ── */
          <div className="mode-unavail">
            <div className="mode-unavail__icon">🏆</div>
            <p className="mode-unavail__title">Đấu Trường Giải Đấu ({game.name})</p>
            <p className="muted" style={{ maxWidth: "420px", margin: "6px auto 16px" }}>
              Bạn có thể tham gia các giải do BTC tổ chức hoặc tự đăng ký mở giải đấu riêng cho câu lạc bộ / bạn bè.
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                className="btn primary"
                onClick={onGoProfile}
              >
                ➕ Đăng ký mở giải đấu mới
              </button>
              <button
                className="btn"
                onClick={() => {
                  setMode("casual");
                }}
              >
                Chơi tự do (Casual)
              </button>
            </div>
          </div>
        ) : (
          /* ── Chế độ Chơi Vui (Casual) & Đua Hạng (Ranked) ── */
          <>
            {/* Input tên đội */}
            <label className="field">
              Tên đội / Tên Bot
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={30}
                placeholder="Ví dụ: Naruto Bot"
                disabled={connecting}
                onKeyDown={(e) => e.key === "Enter" && findMatch()}
              />
            </label>

            {!user && (
              <div style={{ fontSize: "12.5px", color: "var(--muted)", margin: "-4px 0 8px" }}>
                💡 Đang chơi với tư cách Khách.{" "}
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: "600", textDecoration: "underline" }}
                  onClick={onOpenLogin}
                >
                  Đăng nhập
                </button>{" "}
                để lưu điểm Elo và lịch sử trận.
              </div>
            )}

            {/* Nút hành động chính */}
            <div className="lobby-actions">
              <button
                className="btn primary"
                disabled={connecting}
                onClick={findMatch}
              >
                {mode === "ranked" ? "⚔️ Tìm trận Ranked" : "🎮 Tìm trận nhanh"}
              </button>
              {/* Chỉ Casual mới cho tạo phòng riêng */}
              {mode === "casual" && (
                <button
                  className="btn"
                  disabled={connecting}
                  onClick={() => joinRoom(randomCode(), "player", true)}
                >
                  Tạo phòng mới
                </button>
              )}
            </div>

            {/* Vào phòng bằng mã — chỉ Casual */}
            {mode === "casual" && (
              <>
                <div className="or">hoặc vào phòng có sẵn</div>
                <div className="join-row">
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={ROOM_CODE_LENGTH}
                    placeholder="Mã phòng"
                    disabled={connecting}
                    onKeyDown={(e) =>
                      e.key === "Enter" && joinRoom(code, "player")
                    }
                  />
                  <button
                    className="btn"
                    disabled={connecting}
                    onClick={() => joinRoom(code, "player")}
                  >
                    Vào phòng
                  </button>
                  <button
                    className="btn spectate"
                    disabled={connecting}
                    onClick={() => joinRoom(code, "spectator")}
                    title="Xem mà không tham gia"
                  >
                    Chỉ xem
                  </button>
                </div>
              </>
            )}

            {/* Ghi chú cho Ranked */}
            {mode === "ranked" && (
              <p className="notice">
                ⚡ Ranked ghép tự động theo Elo. Kết quả được cập nhật sau mỗi trận.
              </p>
            )}
          </>
        )}

        {/* Trạng thái tìm trận / lỗi */}
        {queue && (
          <p className="hint" role="status">
            Đang tìm đối thủ ({queue.mode})… {queue.wait_time}s{" "}
            <button className="btn small" onClick={onCancel}>
              Hủy
            </button>
          </p>
        )}
        {connecting && !queue && (
          <p className="hint">Đang kết nối…</p>
        )}
        {(problem || error) && (
          <p className="err">{problem || error}</p>
        )}
      </div>
    </div>
  );
}
