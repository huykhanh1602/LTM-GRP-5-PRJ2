import { useEffect, useState } from "react";
import ProfileHeader from "../components/profile/ProfileHeader.jsx";
import MyTournamentsSection from "../components/profile/MyTournamentsSection.jsx";
import CreateTournamentForm from "../components/profile/CreateTournamentForm.jsx";
import ProfileSettingsPanel from "../components/profile/ProfileSettingsPanel.jsx";
import AvatarModal from "../components/profile/AvatarModal.jsx";
import { getTournaments } from "../api.js";
import { apiErrorText, toTournamentCard } from "../utils/tournamentApi.js";
import { useCreateTournamentForm } from "../hooks/useCreateTournamentForm.js";
import { usePasswordSettings } from "../hooks/usePasswordSettings.js";
import { useAvatarModal } from "../hooks/useAvatarModal.js";
import "../styles/auth.css";

export default function ProfilePage({
  user,
  isLoggedIn,
  token,
  onOpenLogin,
  onLogout,
  onUpdateProfile,
  onChangePassword,
  onSetPassword,
  onLinkAccount,
  onOpenTournament,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "settings"
  const [createOpen, setCreateOpen] = useState(false);
  const [myTournaments, setMyTournaments] = useState([]);

  const createForm = useCreateTournamentForm({ token, onOpenTournament });
  const password = usePasswordSettings({ isLoggedIn, onChangePassword, onSetPassword });
  const avatar = useAvatarModal({ user, onUpdateProfile });

  const winRate = user?.matches_played > 0
    ? Math.round(((user?.wins || 0) / user.matches_played) * 100)
    : 0;

  // Tài khoản đăng nhập qua Google/Facebook sẽ chưa có mật khẩu → hiện "Thêm mật khẩu".
  const hasPassword = !!user?.has_password;

  // Danh sách giải đấu do chính người này tổ chức (lọc từ API thật)
  useEffect(() => {
    if (!isLoggedIn) {
      setMyTournaments([]);
      return undefined;
    }
    let active = true;
    getTournaments({ limit: 100 })
      .then((data) => {
        if (!active) return;
        setMyTournaments(
          data.items.map(toTournamentCard).filter((item) => item.organizerId === user?.id),
        );
      })
      .catch((error) => active && createForm.setFormError(apiErrorText(error)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, user?.id, createForm.msg]);

  return (
    <div className="profile-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn small" onClick={onBack}>
          ← Quay lại trang chủ
        </button>

        {isLoggedIn && (
          <button
            className="btn small"
            onClick={onLogout}
            style={{ color: "#dc2626", borderColor: "#fca5a5" }}
          >
            🚪 Đăng xuất
          </button>
        )}
      </div>

      {/* ── Thẻ Profile Header ── */}
      <ProfileHeader
        user={user}
        isLoggedIn={isLoggedIn}
        winRate={winRate}
        onOpenLogin={onOpenLogin}
        onUpdateProfile={onUpdateProfile}
        onOpenAvatar={avatar.open}
      />

      {/* ── Tab điều hướng nội dung ── */}
      <div className="profile-nav-tabs">
        <button
          className={`profile-tab-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          👤 Trang cá nhân
        </button>
        <button
          className={`profile-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => {
            if (!isLoggedIn) {
              onOpenLogin?.();
              return;
            }
            setActiveTab("settings");
          }}
          title={!isLoggedIn ? "Cần đăng nhập để vào Cài đặt" : ""}
        >
          ⚙️ Cài đặt {!isLoggedIn && "(Cần đăng nhập)"}
        </button>
      </div>

      {/* ── Nội dung từng Tab ── */}
      <div className="profile-card">
        {/* TAB 1: TRANG CÁ NHÂN — giải đấu của tôi + mở giải mới */}
        {activeTab === "profile" && (
          <div>
            <MyTournamentsSection
              tournaments={myTournaments}
              createOpen={createOpen}
              onToggleCreate={() => setCreateOpen((v) => !v)}
              onOpenTournament={onOpenTournament}
            />

            {/* Form mở giải đấu mới (ẩn/hiện trong tab Trang cá nhân, ghi thẳng vào server) */}
            {createOpen && (
              <CreateTournamentForm form={createForm} onCancel={() => setCreateOpen(false)} />
            )}
          </div>
        )}

        {/* TAB 2: CÀI ĐẶT — liên kết tài khoản + mật khẩu */}
        {activeTab === "settings" && (
          <ProfileSettingsPanel
            user={user}
            hasPassword={hasPassword}
            password={password}
            onLinkAccount={onLinkAccount}
          />
        )}
      </div>

      {/* ── Modal Đổi Avatar ── */}
      <AvatarModal editor={avatar} />
    </div>
  );
}
