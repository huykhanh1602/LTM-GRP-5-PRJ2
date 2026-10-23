import { useState, useEffect, useMemo } from "react";
import { GAME_CATALOG } from "../games/catalog.js";
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from "../config.js";
import { getTournaments } from "../api.js";
import {
  apiErrorText,
  participantUnit,
  registrationWindowState,
  toTournamentCard,
  tournamentScheduleLines,
} from "../utils/tournamentApi.js";
import { languageLabels } from "../utils/botLanguages.js";
import TrophyIcon from "../components/TrophyIcon.jsx";

// Thứ tự hiển thị tab chế độ
const MODE_ORDER = ["casual", "ranked", "tournament"];

const STATUS_BADGE = {
  draft: { className: "upcoming", label: "Bản nháp" },
  open: { className: "upcoming", label: "Sắp diễn ra" },
  in_progress: { className: "ongoing", label: "Đang diễn ra" },
  completed: { className: "completed", label: "Đã kết thúc" },
  cancelled: { className: "completed", label: "Đã hủy" },
};

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
  isLoggedIn = false,
  mode: modeProp,
  onModeChange,
  onOpenLogin,
  onGoProfile,
  onOpenTournament,
}) {
  const game = GAME_CATALOG.find((g) => g.id === gameId) ?? GAME_CATALOG[0];

  const firstEnabled =
    MODE_ORDER.find((m) => game.modes[m]?.enabled) ?? "casual";
  const mode = modeProp ?? firstEnabled;
  const setMode = (m) => {
    if (modeProp === undefined) return;
    onModeChange?.(m);
  };
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");

  // Quản lý giải đấu
  const [tournaments, setTournaments] = useState([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [tourError, setTourError] = useState("");
  const [tourSearch, setTourSearch] = useState("");
  const [tourFilter, setTourFilter] = useState("all"); // "all" | "in_progress" | "open" | "completed"

  // Danh sách giải đấu lấy thật từ API khi mở tab tournament
  useEffect(() => {
    if (mode !== "tournament") return undefined;
    let active = true;
    setTourLoading(true);
    setTourError("");
    getTournaments({ limit: 100 })
      .then((data) => active && setTournaments(data.items.map(toTournamentCard)))
      .catch((error) => active && setTourError(apiErrorText(error)))
      .finally(() => active && setTourLoading(false));
    return () => {
      active = false;
    };
  }, [mode]);

  // Bộ lọc giải đấu theo từ khóa (tên hoặc mã) và trạng thái
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      if (t.gameId && t.gameId !== game.id) return false;
      if (tourFilter !== "all" && t.status !== tourFilter) return false;

      if (tourSearch.trim()) {
        const query = tourSearch.trim().toLowerCase();
        const matchName = t.name?.toLowerCase().includes(query);
        const matchCode = t.code?.toLowerCase().includes(query);
        const matchOrganizer = t.organizerName?.toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchOrganizer) return false;
      }

      return true;
    });
  }, [tournaments, game.id, tourFilter, tourSearch]);

  const modeCfg = game.modes[mode] ?? {};

  // Dùng cho nhãn trạng thái khung đăng ký trên card giải đấu.
  const now = Date.now();

  // ── Actions ──────────────────────────────────────────────
  function findMatch() {
    if (!isLoggedIn) {
      setProblem("Hãy đăng nhập để dùng tài khoản của bạn làm người chơi.");
      onOpenLogin?.();
      return;
    }
    const playerName = user?.display_name?.trim();
    if (!playerName) return setProblem("Tài khoản chưa có tên hiển thị. Hãy cập nhật tên trong hồ sơ.");
    setProblem("");
    onJoin({
      find: true,
      mode,
      gameId: game.id,
      code: randomCode(),
      teamName: playerName,
      role: "player",
    });
  }

  // Mở phòng chờ của một giải đấu (id = null → hiện danh sách giải để chọn)
  function openTournament(id = null) {
    setProblem("");
    onOpenTournament?.(id);
  }

  function joinRoom(roomCode, role, create = false) {
    // Giải đấu dùng mã giải, không phải mã phòng 4 ký tự.
    if (mode === "tournament") {
      return openTournament();
    }
    if (role === "player" && !isLoggedIn) {
      setProblem("Hãy đăng nhập để dùng tài khoản của bạn làm người chơi.");
      onOpenLogin?.();
      return;
    }
    const playerName = role === "player" ? user?.display_name?.trim() : "";
    if (role === "player" && !playerName)
      return setProblem("Tài khoản chưa có tên hiển thị. Hãy cập nhật tên trong hồ sơ.");
    if (!roomCode.trim()) return setProblem("Hãy nhập mã phòng.");
    setProblem("");
    onJoin({
      code: roomCode.trim().toUpperCase(),
      teamName: playerName,
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
          <div className="tournament-section-content">
            <div className="mode-unavail" style={{ padding: "8px 0 16px" }}>
              <div className="mode-unavail__icon"><TrophyIcon size="64px" /></div>
              <p className="mode-unavail__title">Đấu Trường Giải Đấu ({game.name})</p>
              <p className="muted" style={{ maxWidth: "460px", margin: "4px auto 14px", fontSize: "13px" }}>
                Mỗi giải đấu có một phòng chờ riêng: xem luật chơi, đếm ngược, đăng ký tham gia và
                theo dõi sơ đồ nhánh thật.
              </p>

              {problem && (
                <p className="err" role="alert" style={{ margin: "-6px 0 12px" }}>
                  {problem}
                </p>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                <button className="btn" onClick={onGoProfile}>
                  ➕ Tạo giải đấu mới
                </button>
                <button className="btn" onClick={() => setMode("casual")}>
                  Chơi tự do (Casual)
                </button>
              </div>
            </div>

            {/* ── Bộ lọc & Tìm kiếm giải đấu ── */}
            <div className="tour-filter-bar">
              <div className="tour-search-row">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm theo tên hoặc mã giải..."
                  value={tourSearch}
                  onChange={(e) => setTourSearch(e.target.value)}
                />
                {tourSearch && (
                  <button className="btn small" onClick={() => setTourSearch("")}>
                    Xóa
                  </button>
                )}
              </div>

              <div className="tour-filter-chips">
                {[
                  { id: "all", label: `Tất cả (${tournaments.length})` },
                  { id: "in_progress", label: "Đang diễn ra" },
                  { id: "open", label: "Sắp diễn ra" },
                  { id: "completed", label: "Đã kết thúc" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className={`tour-chip ${tourFilter === f.id ? "active" : ""}`}
                    onClick={() => setTourFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Danh sách các giải đấu ── */}
            <div className="tour-list-container">
              {tourError && <p className="err">{tourError}</p>}
              {tourLoading && <p className="hint">Đang tải danh sách giải đấu…</p>}
              {!tourLoading && !tourError && filteredTournaments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--muted)" }}>
                  <div style={{ fontSize: "32px", marginBottom: "6px" }}>🔍</div>
                  <p style={{ margin: 0 }}>Không tìm thấy giải đấu phù hợp với bộ lọc.</p>
                </div>
              ) : (
                filteredTournaments.map((t) => {
                  const badge = STATUS_BADGE[t.status] ?? { className: "", label: t.status };
                  const hasTrophy = !["open", "in_progress"].includes(t.status);

                  const windowState = registrationWindowState(t, now);
                  const scheduleLines = tournamentScheduleLines(t);
                  // Ngoài khung đăng ký thì card chỉ mời xem, không mời đăng ký.
                  const regLocked = windowState?.cls === "locked";
                  const actionLabel =
                    t.status === "in_progress"
                      ? "Vào xem ⚔️"
                      : t.status === "open"
                        ? regLocked
                          ? "Xem giải 🔍"
                          : "Đăng ký tham gia 📝"
                        : "Xem kết quả";

                  return (
                    <div key={t.id} className="tour-card-item">
                      <div className="tour-card-top">
                        <div>
                          <span className="tour-card-code">{t.code}</span>
                          <h4 className="tour-card-title">{t.name}</h4>
                        </div>
                        <span className={`tour-status-badge ${badge.className}`}>{badge.label}</span>
                      </div>

                      {t.description && (
                        <p style={{ margin: "2px 0 4px", fontSize: "12.5px", color: "var(--text)" }}>
                          {t.description}
                        </p>
                      )}

                      <div className="tour-card-meta">
                        <span>🎮 {t.gameName}</span>
                        <span>👑 {t.organizerName}</span>
                        <span>
                          👥 {t.registered}
                          {t.capacity ? `/${t.capacity}` : ""} {participantUnit(t.participantMode)}
                        </span>
                        {t.languages?.length > 0 && <span>🌐 {languageLabels(t.languages)}</span>}
                      </div>

                      <div className="tour-card-schedule">
                        {scheduleLines.map((line) => (
                          <span key={line.label}>
                            {line.icon} {line.label}: <b>{line.value}</b>
                          </span>
                        ))}
                        {windowState && (
                          <span className={`tour-window-state tour-window-state--${windowState.cls}`}>
                            {windowState.text}
                          </span>
                        )}
                      </div>

                      <div className="tour-card-footer">
                        <span style={{ color: "#d97706", fontWeight: "600" }}>
                          🎁 {t.prize || "Cúp vinh danh"}
                        </span>
                        <button
                          className={`btn small ${t.status === "open" && !regLocked ? "primary" : ""}`}
                          onClick={() => openTournament(t.id)}
                        >
                          {actionLabel}{hasTrophy && <> <TrophyIcon size="20px" /></>}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ── Chế độ Chơi Vui (Casual) & Đua Hạng (Ranked) ── */
          <>
            {isLoggedIn ? (
              <div className="field" aria-label={`Tài khoản thi đấu: ${user?.display_name}`}>
                Người chơi
                <strong>{user?.display_name}</strong>
              </div>
            ) : (
              <div style={{ fontSize: "12.5px", color: "var(--muted)", margin: "-4px 0 8px" }}>
                💡 Đăng nhập để tìm trận bằng tên tài khoản và lưu lịch sử, điểm xếp hạng.{" "}
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
        {(problem || error) && mode !== "tournament" && (
          <p className="err">{problem || error}</p>
        )}
      </div>
    </div>
  );
}
