import { useState, useEffect, useRef, useCallback } from "react";
import HomePage from "./pages/HomePage.jsx";
import GameLobby from "./pages/GameLobby.jsx";
import Match from "./pages/Match.jsx";
import ReplayPage from "./pages/ReplayPage.jsx";
import Room from "./pages/Room.jsx";
import DatabasePage from "./pages/DatabasePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import TournamentLobby from "./pages/TournamentLobby.jsx";
import AuthModal from "./components/AuthModal.jsx";
import TrophyIcon from "./components/TrophyIcon.jsx";
import { useRoom } from "./hooks/useRoom.js";
import { useAuth } from "./hooks/useAuth.js";
import "./styles/pages.css";
import "./styles/home.css";
import "./styles/auth.css";

// ─────────────────────────────────────────────────────────────
// Điều hướng dựa trên hash của URL để nút Back/Forward của trình
// duyệt hoạt động: mỗi lần tiến tới pushState một mốc, nút "quay
// lại" trong app thì history.back() (pop). Route snapshot: {view,gameId,tournamentId}.
//   "home"      → HomePage
//   "lobby"     → GameLobby (Match/Room khi room.phase tương ứng)
//   "tournament"→ TournamentLobby (tournamentId=null → danh sách giải)
//   "replay" | "history" | "rankings" | "profile"
// ─────────────────────────────────────────────────────────────
function hashFor({ view, gameId, tournamentId, mode }) {
  if (view === "home" || !view) return "#/";
  if (view === "profile") return "#/profile";
  if (!gameId) return "#/";
  const base = `#/game/${gameId}`;
  if (view === "lobby") {
    if (mode === "ranked") return `${base}/ranked`;
    if (mode === "tournament") return `${base}/tournaments`;
    return base;
  }
  if (view === "history") return `${base}/history`;
  if (view === "rankings") return `${base}/rankings`;
  if (view === "replay") return `${base}/replay`;
  if (view === "tournament") return tournamentId ? `${base}/tournament/${tournamentId}` : `${base}/tournament`;
  return base;
}

function parseHash(hash) {
  const parts = (hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: "home", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "profile") return { view: "profile", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "game" && parts[1]) {
    const gameId = parts[1];
    const sub = parts[2];
    if (!sub) return { view: "lobby", gameId, tournamentId: null, mode: "casual" };
    if (sub === "ranked") return { view: "lobby", gameId, tournamentId: null, mode: "ranked" };
    if (sub === "tournaments") return { view: "lobby", gameId, tournamentId: null, mode: "tournament" };
    if (sub === "history") return { view: "history", gameId, tournamentId: null, mode: "casual" };
    if (sub === "rankings") return { view: "rankings", gameId, tournamentId: null, mode: "casual" };
    if (sub === "replay") return { view: "replay", gameId, tournamentId: null, mode: "casual" };
    if (sub === "tournament") return { view: "tournament", gameId, tournamentId: parts[3] ?? null, mode: "tournament" };
    return { view: "lobby", gameId, tournamentId: null, mode: "casual" };
  }
  return { view: "home", gameId: null, tournamentId: null, mode: "casual" };
}

export default function App() {
  const [view, setView] = useState("home");
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [databaseReplay, setDatabaseReplay] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tournamentId, setTournamentId] = useState(null);
  const [lobbyMode, setLobbyMode] = useState("casual");

  const room = useRoom();
  const auth = useAuth();

  // Refs để đọc giá trị mới nhất bên trong callback/effect ổn định.
  const selectedGameIdRef = useRef(selectedGameId);
  selectedGameIdRef.current = selectedGameId;
  const tournamentIdRef = useRef(tournamentId);
  tournamentIdRef.current = tournamentId;
  const lobbyModeRef = useRef(lobbyMode);
  lobbyModeRef.current = lobbyMode;
  const roomRef = useRef(room);
  roomRef.current = room;

  // Áp route vào state (không đẩy history) — dùng cho popstate & lần đầu.
  const applyRoute = useCallback((route) => {
    if (route.view === "home") {
      const phase = roomRef.current.phase;
      if (phase === "idle" || phase === "connecting" || phase === "queue") roomRef.current.leave();
    }
    setSelectedGameId(route.gameId ?? null);
    setTournamentId(route.tournamentId ?? null);
    setLobbyMode(route.mode ?? "casual");
    setView(route.view);
  }, []);

  // Điều hướng tiến tới: cập nhật state + pushState (hoặc replaceState).
  const navigate = useCallback((route, { replace = false } = {}) => {
    const next = {
      view: route.view,
      gameId: route.gameId !== undefined ? route.gameId : selectedGameIdRef.current,
      tournamentId: route.tournamentId !== undefined ? route.tournamentId : tournamentIdRef.current,
      mode: route.mode !== undefined ? route.mode : lobbyModeRef.current,
    };
    applyRoute(next);
    const url = hashFor(next);
    if (replace) window.history.replaceState(next, "", url);
    else window.history.pushState(next, "", url);
  }, [applyRoute]);

  // Nút "quay lại" trong app → lùi một mốc lịch sử (pop).
  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate({ view: "home", gameId: null, tournamentId: null }, { replace: true });
  }, [navigate]);

  // Đồng bộ trình duyệt: mốc đầu + lắng nghe Back/Forward.
  useEffect(() => {
    const initial = parseHash(window.location.hash);
    window.history.replaceState(initial, "", hashFor(initial));
    applyRoute(initial);

    const onPop = (event) => applyRoute(event.state ?? parseHash(window.location.hash));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyRoute]);

  // Chọn game từ trang chủ
  function selectGame(gameId) {
    navigate({ view: "lobby", gameId, tournamentId: null, mode: "casual" });
  }

  // Mở phòng chờ của một giải đấu cụ thể (id = null → hiện danh sách giải để chọn)
  function openTournament(id = null) {
    navigate({ view: "tournament", tournamentId: id });
  }

  // Xem replay của một trận đấu trong giải
  function openReplay(replay) {
    setDatabaseReplay(replay);
    navigate({ view: "replay" });
  }

  // Về trang chủ (nhảy tới, push một mốc mới)
  function goHome() {
    navigate({ view: "home", gameId: null, tournamentId: null });
  }

  // ── Xác định trang hiện tại ──────────────────────────────
  let page;

  if (view === "profile") {
    page = (
      <ProfilePage
        user={auth.user}
        isLoggedIn={auth.isLoggedIn}
        token={auth.token}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={() => {
          auth.logout();
          goHome();
        }}
        onUpdateProfile={auth.updateProfile}
        onChangePassword={auth.changePassword}
        onSetPassword={auth.setPassword}
        onLinkAccount={auth.linkAccount}
        onOpenTournament={openTournament}
        onBack={goBack}
      />
    );
  } else if (view === "tournament") {
    page = (
      <TournamentLobby
        key={tournamentId ?? "picker"}
        tournamentId={tournamentId}
        gameId={selectedGameId}
        user={auth.user}
        token={auth.token}
        onBack={goBack}
        onOpenReplay={openReplay}
        onRequireLogin={() => setIsAuthOpen(true)}
      />
    );
  } else if (view === "replay") {
    page = (
      <ReplayPage
        key={databaseReplay?.match_info?.match_id ?? "list"}
        initialReplay={databaseReplay}
        onBack={goBack}
      />
    );
  } else if (view === "history" || view === "rankings") {
    page = (
      <DatabasePage
        key={view}
        view={view}
        onReplay={(replay) => openReplay(replay)}
      />
    );
  } else if (view === "home") {
    page = <HomePage onSelectGame={selectGame} searchQuery={searchQuery} />;
  } else {
    // view === "lobby" — hiển thị tuỳ theo room.phase
    if (room.phase === "match") {
      page = (
        <Match
          key={room.matchKey}
          state={room}
          onReturnToRoom={room.returnToRoom}
          onLeave={room.leave}
        />
      );
    } else if (room.phase === "room") {
      page = (
        <Room
          state={room}
          onSubmit={room.submit}
          onReady={room.setReady}
          onLeave={room.leave}
        />
      );
    } else {
      // idle | connecting | queue → GameLobby
      page = (
        <GameLobby
          gameId={selectedGameId}
          onJoin={room.join}
          onCancel={room.leave}
          onBack={goBack}
          connecting={room.phase === "connecting" || room.phase === "queue"}
          queue={room.phase === "queue" ? room.queue : null}
          error={room.error}
          user={auth.user}
          mode={lobbyMode}
          onModeChange={(m) => navigate({ view: "lobby", mode: m }, { replace: true })}
          onOpenLogin={() => setIsAuthOpen(true)}
          onGoProfile={() => navigate({ view: "profile" })}
          onOpenTournament={openTournament}
        />
      );
    }
  }

  const inGame = room.phase === "room" || room.phase === "match";

  return (
    <div className="app">
      {/* ── Topbar: Xóa chữ Đấu trường, đưa ô tìm kiếm lên ngang hàng ── */}
      <header className="topbar">
        {/* Logo hình ảnh duy nhất (đã xóa chữ Đấu Trường Game Bot) */}
        <div
          className="brand brand--logo-only"
          onClick={goHome}
          title="BotVui — Về trang chủ"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && goHome()}
        >
          <img src="/icons.png" alt="BotVui Logo" className="brand-logo" />
        </div>

        {/* Thanh tìm kiếm đưa lên trên cùng */}
        <div className="search-box topbar-search">
          <input
            type="text"
            className="search-input"
            placeholder="Tìm game, bot, người chơi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="search-btn" aria-label="Tìm kiếm">
            🔍
          </button>
        </div>

        {/* ── Tabs điều hướng: CHỈ KHI ẤN VÀO TỪNG GAME MỚI CÓ ── */}
        {selectedGameId && (
          <nav className="tabs">
            <button
              className={view === "home" ? "on" : ""}
              onClick={goHome}
            >
              🏠 Trang chủ
            </button>

            <button
              className={view === "lobby" ? "on" : ""}
              onClick={() => navigate({ view: "lobby" })}
            >
              🎮 Phòng đấu{inGame ? " ●" : ""}
            </button>

            <button
              className={view === "replay" ? "on" : ""}
              onClick={() => navigate({ view: "replay" })}
            >
              Replay
            </button>

            <button
              className={view === "history" ? "on" : ""}
              onClick={() => navigate({ view: "history" })}
            >
              Lịch sử
            </button>

            <button
              className={view === "rankings" ? "on" : ""}
              onClick={() => navigate({ view: "rankings" })}
            >
              Bảng xếp hạng
            </button>

            <button
              className={view === "tournament" ? "on" : ""}
              onClick={() => openTournament()}
            >
              <TrophyIcon className="trophy-icon--nav" /> Giải đấu
            </button>
          </nav>
        )}

        {/* ── Khu vực Phải: nút tài khoản ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {auth.isLoggedIn ? (
            /* Đã đăng nhập: CHỈ 1 NÚT dẫn vào Trang cá nhân */
            <button
              className="quick-auth-btn"
              onClick={() => navigate({ view: "profile" })}
              style={{
                background: "var(--c-purple-deep)",
                padding: "7px 16px",
                fontSize: "13.5px",
              }}
            >
              <img
                src={auth.user?.avatar || "/icons.png"}
                alt=""
                style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover" }}
              />
              <span>{auth.user?.display_name || "Trang cá nhân"}</span>
            </button>
          ) : (
            /* Chưa đăng nhập: CHỈ 1 NÚT Đăng nhập màu hồng đậm chuẩn BotVui */
            <button
              className="quick-auth-btn"
              onClick={() => setIsAuthOpen(true)}
              style={{ background: "var(--c-pink-deep)" }}
            >
              👤 Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* Nội dung trang */}
      {page}

      {/* ── Modal Đăng nhập / Đăng ký ── */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLogin={auth.login}
        onRegister={auth.register}
        onLoginGoogle={auth.loginGoogle}
        onSetPassword={auth.setPassword}
        onLoginFacebook={auth.loginFacebook}
      />
    </div>
  );
}
