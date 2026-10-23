import { useState } from "react";
import TrophyIcon from "../TrophyIcon.jsx";

// ─────────────────────────────────────────────────────────────
// Thẻ profile: avatar, tên (chỉnh sửa), Elo + thống kê.
// ─────────────────────────────────────────────────────────────
export default function ProfileHeader({
  user,
  isLoggedIn,
  winRate,
  onOpenLogin,
  onUpdateProfile,
  onOpenAvatar,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.display_name || "");

  // Xử lý lưu tên
  function handleSaveProfile(e) {
    e.preventDefault();
    if (!newDisplayName.trim()) return;
    onUpdateProfile({ display_name: newDisplayName.trim() });
    setIsEditing(false);
  }

  return (
    <div className="profile-card">
      <div className="profile-header">
        <div className="profile-avatar-row">
          <div
            className="profile-avatar-container"
            onClick={onOpenAvatar}
            title="Bấm để đổi Avatar"
          >
            <img
              src={user?.avatar || "/icons.png"}
              alt="Avatar"
              className="profile-avatar"
            />
            <div className="profile-avatar-overlay">
              <span>📷 Đổi ảnh</span>
            </div>
          </div>

          <div>
            {isEditing ? (
              <form onSubmit={handleSaveProfile} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  className="reg-input"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  style={{ padding: "4px 8px" }}
                />
                <button type="submit" className="btn small primary">Lưu</button>
                <button type="button" className="btn small" onClick={() => setIsEditing(false)}>Hủy</button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 className="profile-name">{user?.display_name || "Chiến Binh Bot"}</h2>
                <button
                  className="btn small"
                  onClick={() => setIsEditing(true)}
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                >
                  ✏️ Sửa
                </button>
              </div>
            )}
            <p className="profile-identifier">
              {isLoggedIn
                ? user?.email || user?.phone || user?.identifier
                : "Đang chơi với tư cách Khách (Chưa đăng nhập)"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className="mode-pill mode-pill--ranked" style={{ fontSize: "12px", padding: "4px 12px" }}>
            <TrophyIcon size="18px" /> Elo: {user?.elo || 1000}
          </span>
          {!isLoggedIn && (
            <button className="btn small primary" onClick={onOpenLogin}>
              Đăng nhập tài khoản
            </button>
          )}
        </div>
      </div>

      {/* ── Thống kê ── */}
      <div className="profile-stats-grid">
        <div className="profile-stat-box">
          <div className="profile-stat-val">{user?.elo || 1000}</div>
          <div className="profile-stat-lbl">Điểm Elo</div>
        </div>
        <div className="profile-stat-box">
          <div className="profile-stat-val">{user?.matches_played || 0}</div>
          <div className="profile-stat-lbl">Số trận đã đấu</div>
        </div>
        <div className="profile-stat-box">
          <div className="profile-stat-val">{user?.wins || 0}</div>
          <div className="profile-stat-lbl">Số trận thắng</div>
        </div>
        <div className="profile-stat-box">
          <div className="profile-stat-val">{winRate}%</div>
          <div className="profile-stat-lbl">Tỉ lệ thắng</div>
        </div>
      </div>
    </div>
  );
}