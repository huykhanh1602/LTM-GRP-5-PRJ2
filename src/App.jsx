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
import SoundControl from "./components/SoundControl.jsx";
import TournamentNotifications from "./components/profile/TournamentNotifications.jsx";
import { sound } from "./audio/soundManager.js";
import { useRoom } from "./hooks/useRoom.js";
import { useAuth } from "./hooks/useAuth.js";
import { GAME_CATALOG } from "./games/catalog.js";
import { getTournamentNotifications } from "./api.js";
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
function hashFor({ view, gameId, tournamentId, mode, roundNo }) {
  if (view === "home" || !view) return "#/";
  if (view === "profile") return "#/profile";
  if (view === "notifications") return "#/notifications";
  if (view === "notifications") return "#/notifications";
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
  if (view === "tournament") return tournamentId ? `${base}/tournament/${tournamentId}${roundNo ? `/round/${roundNo}` : ""}` : `${base}/tournament`;
  return base;
}

function parseHash(hash) {
  const parts = (hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: "home", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "profile") return { view: "profile", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "notifications") return { view: "notifications", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "notifications") return { view: "notifications", gameId: null, tournamentId: null, mode: "casual" };
  if (parts[0] === "game" && parts[1]) {
    const gameId = parts[1];
    const sub = parts[2];
    if (!sub) return { view: "lobby", gameId, tournamentId: null, mode: "casual" };
    if (sub === "ranked") return { view: "lobby", gameId, tournamentId: null, mode: "ranked" };
    if (sub === "tournaments") return { view: "lobby", gameId, tournamentId: null, mode: "tournament" };
    if (sub === "history") return { view: "history", gameId, tournamentId: null, mode: "casual" };
    if (sub === "rankings") return { view: "rankings", gameId, tournamentId: null, mode: "casual" };
    if (sub === "replay") return { view: "replay", gameId, tournamentId: null, mode: "casual" };
    if (sub === "tournament") return { view: "tournament", gameId, tournamentId: parts[3] ?? null,
      roundNo: parts[4] === "round" && Number.isSafeInteger(Number(parts[5])) ? Number(parts[5]) : null, mode: "tournament" };
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
  const [tournamentRoundNo, setTournamentRoundNo] = useState(null);
  const [lobbyMode, setLobbyMode] = useState("casual");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsMenuRef = useRef(null);

  const room = useRoom();
  const auth = useAuth();

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const closeOnOutside = event => {
      if (!notificationsMenuRef.current?.contains(event.target)) setIsNotificationsOpen(false);
    };
    const closeOnEscape = event => { if (event.key === "Escape") setIsNotificationsOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!auth.token) { setUnreadNotifications(0); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await getTournamentNotifications(auth.token, { limit: 1 });
        let readGames = [];
        try { readGames = JSON.parse(localStorage.getItem("botvui.read-game-announcements") || "[]"); } catch { /* Ignore invalid local state. */ }
        const newGameCount = GAME_CATALOG.filter(game => game.categories?.includes("new") && !readGames.includes(`game:${game.id}`)).length;
        if (active) setUnreadNotifications((result.unread ?? 0) + newGameCount);
      } catch { if (active) setUnreadNotifications(0); }
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [auth.token]);

  // Refs để đọc giá trị mới nhất bên trong callback/effect ổn định.
  const selectedGameIdRef = useRef(selectedGameId);
  selectedGameIdRef.current = selectedGameId;
  const tournamentIdRef = useRef(tournamentId);
  tournamentIdRef.current = tournamentId;
  const lobbyModeRef = useRef(lobbyMode);
  lobbyModeRef.current = lobbyMode;
  const roomRef = useRef(room);
  roomRef.current = room;

  // Mỗi game một chủ đề màu: áp accentColor của game đang chọn lên :root.
  // Ở trang chủ/profile (không có game) thì trả về màu hồng mặc định.
  useEffect(() => {
    const game = GAME_CATALOG.find((g) => g.id === selectedGameId);
    const root = document.documentElement;
    if (game?.accentColor) root.style.setProperty("--accent", game.accentColor);
    else root.style.removeProperty("--accent");
    if (game?.cover) root.style.setProperty("--lobby-bg", `url("${game.cover}")`);
    else root.style.removeProperty("--lobby-bg");
  }, [selectedGameId]);

  // Nhạc nền theo ngữ cảnh: trang chủ → lobby; vào game (chờ/đếm) → pc; đang đánh → battle của game đó.
  useEffect(() => {
    let key = "lobby";
    if (view === "lobby") {
      if (room.phase === "match") {
        key = selectedGameId === "snake_battle" ? "battle_rsm"
            : selectedGameId === "rps_chess" ? "battle_kbb"
            : "pc";
      } else {
        key = "pc";
      }
    }
    sound.setBgm(key);
  }, [view, room.phase, selectedGameId]);

  // Tiếng "click" cho mọi nút trên toàn app (delegate, bắt ở pha capture).
  useEffect(() => {
    const onDown = (e) => {
      if (e.target?.closest?.("button, a, .btn, [role='button'], .tabs button")) sound.play("click");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  // Áp route vào state (không đẩy history) — dùng cho popstate & lần đầu.
  const applyRoute = useCallback((route) => {
    const phase = roomRef.current.phase;
    if (route.view === "home") {
      // Roi phong khi ve trang chu o cac giai doan chua vao match
      if (phase === "idle" || phase === "connecting" || phase === "queue") roomRef.current.leave();
    } else if (route.view === "lobby") {
      // Roi phong khi chuyen sang game khac trong khi dang trong phong/match
      const currentGameId = selectedGameIdRef.current;
      if (
        currentGameId !== route.gameId &&
        (phase === "match" || phase === "room" || phase === "connecting" || phase === "queue")
      ) {
        roomRef.current.leave();
      }
    }
    setSelectedGameId(route.gameId ?? null);
    setTournamentId(route.tournamentId ?? null);
    setTournamentRoundNo(route.roundNo ?? null);
    setLobbyMode(route.mode ?? "casual");
    setView(route.view);
  }, []);

  // Điều hướng tiến tới: cập nhật state + pushState (hoặc replaceState).
  const navigate = useCallback((route, { replace = false } = {}) => {
    const next = {
      view: route.view,
      gameId: route.gameId !== undefined ? route.gameId : selectedGameIdRef.current,
      tournamentId: route.tournamentId !== undefined ? route.tournamentId : tournamentIdRef.current,
      roundNo: route.roundNo !== undefined ? route.roundNo : null,
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
  function openTournament(id = null, roundNo = null, gameId = null) {
    navigate({ view: "tournament", tournamentId: id, roundNo, ...(gameId ? { gameId } : {}) });
  }

  function openNotificationTarget(item) {
    if (item.target_type === "game" || item.type === "game") {
      const id = item.game_id ?? item.gameId;
      navigate({ view: "lobby", gameId: id, tournamentId: null, mode: "casual" });
      return;
    }
    openTournament(item.tournament_id ?? item.tournamentId ?? null, item.metadata?.roundNo ?? item.round_no ?? null,
      item.game_id ?? item.gameId ?? null);
  }

  // "Vào phòng đấu" từ My Match Banner: mở phòng riêng của trận trên trang Lobby.
  function enterMatchRoom({ tournamentId, roundNo, slotIndex, gameId, spectator = false } = {}) {
    if (auth.isLoggedIn) {
      room.join({
        tournament: { tournamentId, roundNo, slotIndex },
        gameId,
        mode: "tournament",
        teamName: auth.user?.display_name?.trim() ?? "",
        role: spectator ? "spectator" : "player",
        authToken: auth.token,
      });
    } else {
      setIsAuthOpen(true);
      return;
    }
    // Vào thẳng tab "Phòng đấu" (#/game/:gameId) — không nhảy qua tab /tournaments.
    // Phòng (Room/Match) tự hiển thị khi room.phase chuyển sang "room"/"match".
    navigate({ view: "lobby", gameId, mode: "casual" }, { replace: true });
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

  if (view === "notifications") {
    page = <main className="global-notifications-page">
      <button className="btn small" onClick={goBack}>← Quay lại</button>
      {auth.isLoggedIn ? <TournamentNotifications token={auth.token} userId={auth.user?.id} onOpenTarget={openNotificationTarget} onUnreadChange={setUnreadNotifications} /> :
        <section className="notifications-login-prompt"><h1>Thông báo giải đấu</h1>
          <p>Đăng nhập để xem lịch thi đấu và kết quả của các giải bạn tham gia.</p>
          <button className="quick-auth-btn" onClick={() => setIsAuthOpen(true)}>👤 Đăng nhập</button>
        </section>}
    </main>;
  } else if (view === "profile") {
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
        roundNo={tournamentRoundNo}
        gameId={selectedGameId}
        user={auth.user}
        token={auth.token}
        onBack={goBack}
        onOpenReplay={openReplay}
        onRequireLogin={() => setIsAuthOpen(true)}
        onEnterRoom={enterMatchRoom}
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
          onCancel={room.leave}
          onBack={goBack}
          connecting={room.phase === "connecting" || room.phase === "queue"}
          queue={room.phase === "queue" ? room.queue : null}
          error={room.error}
          user={auth.user}
          isLoggedIn={auth.isLoggedIn}
          onJoin={(params) => room.join({
            ...params,
            authToken: auth.isLoggedIn ? auth.token : null,
          })}
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

        {/* ── Khu vực Phải: âm thanh + nút tài khoản ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <SoundControl />
          <div className="notification-menu" ref={notificationsMenuRef}>
            <button className={`topbar-notifications ${isNotificationsOpen || view === "notifications" ? "on" : ""}`}
              onClick={() => {
                if (!auth.isLoggedIn) { setIsAuthOpen(true); return; }
                setIsNotificationsOpen(open => !open);
              }} aria-label={`Thông báo${unreadNotifications > 0 ? `, ${unreadNotifications} chưa đọc` : ""}`}
              aria-expanded={isNotificationsOpen} aria-haspopup="dialog" title="Thông báo">
              <span className="topbar-notifications__icon" aria-hidden="true">🔔</span>
              {unreadNotifications > 0 && <span className="topbar-notifications__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
            </button>
            {isNotificationsOpen && <TournamentNotifications
              compact
              token={auth.token}
              userId={auth.user?.id}
              onUnreadChange={setUnreadNotifications}
              onClose={() => setIsNotificationsOpen(false)}
              onViewAll={() => {
                setIsNotificationsOpen(false);
                navigate({ view: "notifications", gameId: null, tournamentId: null });
              }}
              onOpenTarget={item => {
                setIsNotificationsOpen(false);
                openNotificationTarget(item);
              }}
            />}
          </div>
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
