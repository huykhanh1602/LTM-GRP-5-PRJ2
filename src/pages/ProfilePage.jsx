import { useState } from "react";
import { GAME_CATALOG } from "../games/catalog.js";
import "../styles/auth.css";

const PRESET_AVATARS = [
  "/icons.png",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Titan",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Ninja",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Cyber",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Alpha",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Phoenix",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Shadow",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Dragon",
];

export default function ProfilePage({
  user,
  isLoggedIn,
  onOpenLogin,
  onLogout,
  onUpdateProfile,
  onChangePassword,
  onAddTournament,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("tournaments"); // "tournaments" | "create_tour" | "security"

  // State mở giải đấu — số lượng đội lên tới 1000
  const [tourName, setTourName] = useState("");
  const [selectedGame, setSelectedGame] = useState(GAME_CATALOG[0]?.id || "rps_chess");
  const [maxTeams, setMaxTeams] = useState(16);
  const [startTime, setStartTime] = useState("");
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");

  // State chỉnh sửa tên
  const [isEditing, setIsEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.display_name || "");

  // State đổi avatar modal
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "/icons.png");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");

  // State đổi mật khẩu
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState({ type: "", text: "" });
  const [isChangingPass, setIsChangingPass] = useState(false);

  const winRate = user?.matches_played > 0
    ? Math.round(((user?.wins || 0) / user.matches_played) * 100)
    : 0;

  // Xử lý tạo giải
  function handleCreateTour(e) {
    e.preventDefault();
    if (!tourName.trim()) {
      setMsg("Vui lòng nhập tên giải đấu.");
      return;
    }
    const teamsCount = Math.min(Math.max(Number(maxTeams) || 2, 2), 1000);

    const tourData = {
      name: tourName.trim(),
      game_id: selectedGame,
      game_name: GAME_CATALOG.find((g) => g.id === selectedGame)?.name || selectedGame,
      participants: teamsCount,
      start_time: startTime || "Cuối tuần này",
      prize: prize || "Cúp lưu niệm & Vinh danh BXH",
      description: description.trim(),
    };

    onAddTournament(tourData);
    setMsg("✅ Đã tạo giải đấu thành công! Đang chờ duyệt từ hệ thống.");
    setTourName("");
    setDescription("");
    setTimeout(() => {
      setMsg("");
      setActiveTab("tournaments");
    }, 1500);
  }

  // Xử lý lưu tên
  function handleSaveProfile(e) {
    e.preventDefault();
    if (!newDisplayName.trim()) return;
    onUpdateProfile({ display_name: newDisplayName.trim() });
    setIsEditing(false);
  }

  // Xử lý lưu avatar
  function handleSaveAvatar() {
    const finalAvatar = customAvatarUrl.trim() || selectedAvatar;
    onUpdateProfile({ avatar: finalAvatar });
    setIsAvatarModalOpen(false);
  }

  // Xử lý tải ảnh từ máy tính
  function handleAvatarFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Ảnh không được vượt quá 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedAvatar(event.target.result);
        setCustomAvatarUrl("");
      }
    };
    reader.readAsDataURL(file);
  }

  // Xử lý đổi mật khẩu
  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    setPasswordMsg({ type: "", text: "" });

    if (!isLoggedIn) {
      return setPasswordMsg({
        type: "err",
        text: "Bạn phải đăng nhập tài khoản trước mới có thể đổi mật khẩu.",
      });
    }

    if (!oldPassword) {
      return setPasswordMsg({ type: "err", text: "Vui lòng nhập mật khẩu hiện tại." });
    }
    if (newPassword.length < 6) {
      return setPasswordMsg({ type: "err", text: "Mật khẩu mới phải có ít nhất 6 ký tự." });
    }
    if (newPassword !== confirmNewPassword) {
      return setPasswordMsg({ type: "err", text: "Mật khẩu xác nhận không trùng khớp." });
    }

    setIsChangingPass(true);
    try {
      if (onChangePassword) {
        await onChangePassword(oldPassword, newPassword);
      }
      setPasswordMsg({ type: "ok", text: "🎉 Đổi mật khẩu thành công!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordMsg({ type: "err", text: err.message || "Đổi mật khẩu thất bại." });
    } finally {
      setIsChangingPass(false);
    }
  }

  const createdTournaments = user?.created_tournaments || [];

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
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar-row">
            <div
              className="profile-avatar-container"
              onClick={() => setIsAvatarModalOpen(true)}
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
              🏆 Elo: {user?.elo || 1000}
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

      {/* ── Tab điều hướng nội dung ── */}
      <div className="profile-nav-tabs">
        <button
          className={`profile-tab-btn ${activeTab === "tournaments" ? "active" : ""}`}
          onClick={() => setActiveTab("tournaments")}
        >
          🏆 Giải đấu của tôi ({createdTournaments.length})
        </button>
        <button
          className={`profile-tab-btn ${activeTab === "create_tour" ? "active" : ""}`}
          onClick={() => setActiveTab("create_tour")}
        >
          ➕ Đăng ký mở giải đấu mới
        </button>
        <button
          className={`profile-tab-btn ${activeTab === "security" ? "active" : ""}`}
          onClick={() => {
            if (!isLoggedIn) {
              if (onOpenLogin) onOpenLogin();
            } else {
              setActiveTab("security");
            }
          }}
          title={!isLoggedIn ? "Cần đăng nhập tài khoản để đổi mật khẩu" : ""}
        >
          🔒 Đổi mật khẩu & Bảo mật {!isLoggedIn && "(Cần đăng nhập)"}
        </button>
      </div>

      {/* ── Nội dung từng Tab ── */}
      <div className="profile-card">
        {/* TAB 1: Danh sách giải đấu */}
        {activeTab === "tournaments" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Các giải đấu cá nhân đã tạo</h3>
              <button className="btn small primary" onClick={() => setActiveTab("create_tour")}>
                + Mở giải mới
              </button>
            </div>

            {createdTournaments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)" }}>
                <div style={{ fontSize: "40px", marginBottom: "8px" }}>📜</div>
                <p>Bạn chưa mở giải đấu nào.</p>
                <button className="btn primary" onClick={() => setActiveTab("create_tour")}>
                  Tạo giải đấu đầu tiên ngay!
                </button>
              </div>
            ) : (
              createdTournaments.map((t) => (
                <div key={t.id} className="tour-item-card">
                  <div>
                    <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--text)" }}>
                      {t.name}
                    </h4>
                    <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <span>🎮 Game: {t.game_name || t.game_id}</span>
                      <span>👥 Tối đa: {t.participants} đội</span>
                      <span>⏰ Khởi tranh: {t.start_time}</span>
                    </div>
                  </div>
                  <span className={`tour-status-badge ${t.status || "pending"}`}>
                    {t.status === "active" ? "Đang diễn ra" : "Chờ duyệt / Sắp mở"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: Đăng ký mở giải đấu mới — Số lượng đội lên tới 1000 */}
        {activeTab === "create_tour" && (
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Đăng ký tổ chức giải đấu cá nhân / cộng đồng</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "var(--muted)" }}>
              Hỗ trợ quy mô giải đấu lên tới <strong>1.000 đội</strong> tham gia thi đấu cùng lúc.
            </p>

            {msg && (
              <div
                className="auth-error"
                style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534", marginBottom: "14px" }}
              >
                {msg}
              </div>
            )}

            <form onSubmit={handleCreateTour} className="tournament-reg-form">
              <div className="reg-field">
                <label>Tên giải đấu *</label>
                <input
                  type="text"
                  className="reg-input"
                  placeholder="Ví dụ: Đại Chiến Bot Toàn Quốc 2026"
                  value={tourName}
                  onChange={(e) => setTourName(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="reg-field">
                  <label>Chọn Game thi đấu</label>
                  <select
                    className="reg-select"
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                  >
                    {GAME_CATALOG.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {!g.available ? "(Sắp ra mắt)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* SỐ LƯỢNG ĐỘI LÊN TỚI 1000 */}
                <div className="reg-field">
                  <label>
                    Số lượng đội thi đấu (Tối đa: <strong>1.000 đội</strong>)
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="number"
                      min={2}
                      max={1000}
                      className="reg-input"
                      value={maxTeams}
                      onChange={(e) => setMaxTeams(e.target.value)}
                      style={{ width: "120px" }}
                      required
                    />
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>đội</span>
                  </div>
                  {/* Các nút bấm chọn nhanh quy mô */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                    {[8, 16, 32, 64, 128, 256, 512, 1000].map((num) => (
                      <button
                        key={num}
                        type="button"
                        className="btn small"
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          background: Number(maxTeams) === num ? "var(--accent)" : undefined,
                          color: Number(maxTeams) === num ? "#fff" : undefined,
                        }}
                        onClick={() => setMaxTeams(num)}
                      >
                        {num === 1000 ? "🔥 1000 đội" : `${num} đội`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="reg-field">
                  <label>Thời gian dự kiến bắt đầu</label>
                  <input
                    type="text"
                    className="reg-input"
                    placeholder="Ví dụ: 19:00 Thứ Bảy ngày 25/10/2026"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>

                <div className="reg-field">
                  <label>Giải thưởng / Vinh danh</label>
                  <input
                    type="text"
                    className="reg-input"
                    placeholder="Ví dụ: Cúp vô địch, Vinh danh BXH"
                    value={prize}
                    onChange={(e) => setPrize(e.target.value)}
                  />
                </div>
              </div>

              <div className="reg-field">
                <label>Mô tả / Thể thức & Quy định nộp bot</label>
                <textarea
                  className="reg-textarea"
                  placeholder="Quy định ngôn ngữ lập trình bot (Python), thời gian timeout mỗi lượt, hình thức ghép đôi..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" className="btn primary" style={{ padding: "10px 24px" }}>
                  🚀 Gửi đơn đăng ký mở giải
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveTab("tournaments")}
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: Đổi Mật Khẩu (Phải có tài khoản mới được đổi) */}
        {activeTab === "security" && (
          <div style={{ maxWidth: "480px" }}>
            <h3 style={{ margin: "0 0 8px" }}>Đổi mật khẩu tài khoản</h3>

            {!isLoggedIn ? (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1.5px solid #fecaca",
                  borderRadius: "12px",
                  padding: "20px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🔒</div>
                <h4 style={{ margin: "0 0 6px", color: "#b91c1c" }}>
                  Bạn phải có tài khoản mới đổi được mật khẩu
                </h4>
                <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "#64748b" }}>
                  Hiện bạn đang ở chế độ chơi Khách ẩn danh. Vui lòng đăng nhập hoặc tạo tài khoản để đặt mật khẩu bảo vệ.
                </p>
                <button className="btn primary" onClick={onOpenLogin}>
                  Đăng nhập / Đăng ký ngay
                </button>
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 18px", fontSize: "13.5px", color: "var(--muted)" }}>
                  Hãy chọn mật khẩu mạnh từ 6 ký tự trở lên để bảo vệ tài khoản bot và lịch sử thi đấu của bạn.
                </p>

                {passwordMsg.text && (
                  <div
                    className="auth-error"
                    style={{
                      background: passwordMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
                      borderColor: passwordMsg.type === "ok" ? "#bbf7d0" : "#fecaca",
                      color: passwordMsg.type === "ok" ? "#166534" : "#dc2626",
                      marginBottom: "16px",
                    }}
                  >
                    {passwordMsg.text}
                  </div>
                )}

                <form onSubmit={handleChangePasswordSubmit} className="tournament-reg-form">
                  <div className="reg-field">
                    <label>Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      className="reg-input"
                      placeholder="Nhập mật khẩu hiện tại"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      disabled={isChangingPass}
                      required
                    />
                  </div>

                  <div className="reg-field">
                    <label>Mật khẩu mới</label>
                    <input
                      type="password"
                      className="reg-input"
                      placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isChangingPass}
                      required
                    />
                  </div>

                  <div className="reg-field">
                    <label>Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      className="reg-input"
                      placeholder="Nhập lại mật khẩu mới"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={isChangingPass}
                      required
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={isChangingPass}
                      style={{ padding: "10px 24px" }}
                    >
                      {isChangingPass ? "Đang xử lý..." : "🔒 Cập nhật mật khẩu mới"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Đổi Avatar ── */}
      {isAvatarModalOpen && (
        <div className="auth-overlay" onClick={() => setIsAvatarModalOpen(false)}>
          <div className="auth-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <button
              className="auth-close"
              onClick={() => setIsAvatarModalOpen(false)}
              aria-label="Đóng"
            >
              ✕
            </button>

            <h3 style={{ margin: "0 0 6px", textAlign: "center" }}>Chọn Avatar Bot</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--muted)", textAlign: "center" }}>
              Chọn avatar yêu thích hoặc tải ảnh từ máy tính
            </p>

            <div className="avatar-grid">
              {PRESET_AVATARS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`avatar-option ${selectedAvatar === url && !customAvatarUrl ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedAvatar(url);
                    setCustomAvatarUrl("");
                  }}
                >
                  <img src={url} alt={`Avatar ${idx}`} />
                </button>
              ))}
            </div>

            <div style={{ margin: "14px 0" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                Tải ảnh từ máy tính (PNG, JPG, max 2MB):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileUpload}
                style={{ fontSize: "13px", width: "100%" }}
              />
            </div>

            <div style={{ margin: "14px 0" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                Hoặc dán link ảnh trực tiếp:
              </label>
              <input
                type="text"
                className="reg-input"
                placeholder="https://..."
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                className="btn primary"
                onClick={handleSaveAvatar}
                style={{ flex: 1 }}
              >
                Lưu Avatar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setIsAvatarModalOpen(false)}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
