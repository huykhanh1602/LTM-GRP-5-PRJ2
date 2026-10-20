import { useState } from "react";
import HomePage from "./pages/HomePage.jsx";
import GameLobby from "./pages/GameLobby.jsx";
import Match from "./pages/Match.jsx";
import ReplayPage from "./pages/ReplayPage.jsx";
import Room from "./pages/Room.jsx";
import DatabasePage from "./pages/DatabasePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AuthModal from "./components/AuthModal.jsx";
import { useRoom } from "./hooks/useRoom.js";
import { useAuth } from "./hooks/useAuth.js";
import "./styles/pages.css";
import "./styles/home.css";
import "./styles/auth.css";

// ─────────────────────────────────────────────────────────────
// Luồng điều hướng ứng dụng:
//   "home"      → HomePage (Banner Mascot lướt tự động, Danh mục, Lưới game)
//   "lobby"     → GameLobby (Chỉ khi ấn vào game mới có tab: Trang chủ, Replay, Lịch sử, BXH)
//   "profile"   → ProfilePage (Quản lý hồ sơ, Elo, Đổi mật khẩu, Mở giải đấu)
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [databaseReplay, setDatabaseReplay] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const room = useRoom();
  const auth = useAuth();

  // Chọn game từ trang chủ
  function selectGame(gameId) {
    setSelectedGameId(gameId);
    setView("lobby");
  }

  // Quay về trang chủ
  function goHome() {
    if (room.phase === "idle" || room.phase === "connecting" || room.phase === "queue") {
      room.leave();
    }
    setSelectedGameId(null);
    setView("home");
  }

  // ── Xác định trang hiện tại ──────────────────────────────
  let page;

  if (view === "profile") {
    page = (
      <ProfilePage
        user={auth.user}
        isLoggedIn={auth.isLoggedIn}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={() => {
          auth.logout();
          goHome();
        }}
        onUpdateProfile={auth.updateProfile}
        onChangePassword={auth.changePassword}
        onLinkAccount={auth.linkAccount}
        onAddTournament={auth.addTournament}
        onBack={goHome}
      />
    );
  } else if (view === "replay") {
    page = (
      <ReplayPage
        key={databaseReplay?.match_info?.match_id ?? "list"}
        initialReplay={databaseReplay}
        onBack={() => setView(selectedGameId ? "lobby" : "home")}
      />
    );
  } else if (view === "history" || view === "rankings") {
    page = (
      <DatabasePage
        key={view}
        view={view}
        onReplay={(replay) => {
          setDatabaseReplay(replay);
          setView("replay");
        }}
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
          onBack={goHome}
          connecting={room.phase === "connecting" || room.phase === "queue"}
          queue={room.phase === "queue" ? room.queue : null}
          error={room.error}
          user={auth.user}
          onOpenLogin={() => setIsAuthOpen(true)}
          onGoProfile={() => setView("profile")}
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
              onClick={() => setView("lobby")}
            >
              🎮 Phòng đấu{inGame ? " ●" : ""}
            </button>

            <button
              className={view === "replay" ? "on" : ""}
              onClick={() => setView("replay")}
            >
              Replay
            </button>

            <button
              className={view === "history" ? "on" : ""}
              onClick={() => setView("history")}
            >
              Lịch sử
            </button>

            <button
              className={view === "rankings" ? "on" : ""}
              onClick={() => setView("rankings")}
            >
              Bảng xếp hạng
            </button>
          </nav>
        )}

        {/* ── Khu vực Phải: CHỈ 1 NÚT DUY NHẤT ĐỨNG MỘT MÌNH ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          {auth.isLoggedIn ? (
            /* Đã đăng nhập: CHỈ 1 NÚT dẫn vào Trang cá nhân */
            <button
              className="quick-auth-btn"
              onClick={() => setView("profile")}
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
        onLoginFacebook={auth.loginFacebook}
      />
    </div>
  );
}
