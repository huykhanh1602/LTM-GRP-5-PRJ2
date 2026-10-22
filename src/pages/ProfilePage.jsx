import { useEffect, useState } from "react";
import { GAME_CATALOG } from "../games/catalog.js";
import { BOT_LANGUAGES, languageLabels } from "../utils/botLanguages.js";
import { createTournament, getTournaments } from "../api.js";
import { apiErrorText, formatStartsAt, toTournamentCard } from "../utils/tournamentApi.js";
import "../styles/auth.css";

const pad2 = (value) => String(value).padStart(2, "0");

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const TOUR_STATUS = {
  draft: { className: "upcoming", label: "Bản nháp" },
  open: { className: "upcoming", label: "Sắp khởi tranh" },
  in_progress: { className: "active", label: "Đang diễn ra" },
  completed: { className: "completed", label: "Đã kết thúc" },
  cancelled: { className: "completed", label: "Đã hủy" },
};

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

  // State mở giải đấu
  const [tourName, setTourName] = useState("");
  const [selectedGame, setSelectedGame] = useState(GAME_CATALOG[0]?.id || "rps_chess");
  const [maxTeams, setMaxTeams] = useState(16);
  const [startDate, setStartDate] = useState("");
  const [startClock, setStartClock] = useState("");
  const [languages, setLanguages] = useState(["python"]);
  const [rules, setRules] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [myTournaments, setMyTournaments] = useState([]);
  const [msg, setMsg] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [linkingProvider, setLinkingProvider] = useState("");

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
      .catch((error) => active && setFormError(apiErrorText(error)));
    return () => {
      active = false;
    };
  }, [isLoggedIn, user?.id, msg]);

  function toggleLanguage(id) {
    setLanguages((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  // Tạo giải đấu thật qua API
  async function handleCreateTour(e) {
    e.preventDefault();
    setFormError("");

    if (!token) return setFormError("Bạn cần đăng nhập để mở giải đấu.");
    if (!tourName.trim()) return setFormError("Vui lòng nhập tên giải đấu.");
    if (!startDate || !startClock) {
      return setFormError("Vui lòng chọn chính xác ngày và giờ bắt đầu.");
    }
    const startsAt = new Date(`${startDate}T${startClock}`);
    if (Number.isNaN(startsAt.getTime())) {
      return setFormError("Ngày hoặc giờ bắt đầu không hợp lệ.");
    }
    if (startsAt.getTime() <= Date.now()) {
      return setFormError("Thời gian bắt đầu phải ở tương lai.");
    }
    if (languages.length === 0) {
      return setFormError("Hãy chọn ít nhất một ngôn ngữ cho bot dự thi.");
    }

    const ruleLines = rules
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    setCreating(true);
    try {
      const created = await createTournament(
        {
          name: tourName.trim(),
          gameId: selectedGame,
          startsAt: startsAt.toISOString(),
          maxParticipants: Math.min(Math.max(Number(maxTeams) || 2, 2), 128),
          languages,
          rules: ruleLines,
          prize: prize.trim(),
          description: description.trim(),
        },
        token,
      );
      setMsg(`🎉 Đã mở giải đấu "${created.name}" (mã ${created.code}).`);
      setTourName("");
      setStartDate("");
      setStartClock("");
      setLanguages(["python"]);
      setRules("");
      setPrize("");
      setDescription("");
      setTimeout(() => {
        setMsg("");
        onOpenTournament?.(created.id);
      }, 900);
    } catch (error) {
      setFormError(apiErrorText(error));
    } finally {
      setCreating(false);
    }
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
    if (newPassword.length < 8) {
      return setPasswordMsg({ type: "err", text: "Mật khẩu mới phải có ít nhất 8 ký tự." });
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

  // Đặt mật khẩu lần đầu cho tài khoản đăng nhập bằng Google/Facebook (chưa có mật khẩu)
  async function handleSetPasswordSubmit(e) {
    e.preventDefault();
    setPasswordMsg({ type: "", text: "" });

    if (!isLoggedIn) {
      return setPasswordMsg({ type: "err", text: "Bạn phải đăng nhập trước khi thêm mật khẩu." });
    }
    if (newPassword.length < 8) {
      return setPasswordMsg({ type: "err", text: "Mật khẩu phải có ít nhất 8 ký tự." });
    }
    if (newPassword !== confirmNewPassword) {
      return setPasswordMsg({ type: "err", text: "Mật khẩu xác nhận không trùng khớp." });
    }

    setIsChangingPass(true);
    try {
      await onSetPassword?.(newPassword);
      setPasswordMsg({
        type: "ok",
        text: "🎉 Đã thêm mật khẩu. Từ giờ bạn có thể đăng nhập bằng email + mật khẩu.",
      });
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordMsg({ type: "err", text: err.message || "Thêm mật khẩu thất bại." });
    } finally {
      setIsChangingPass(false);
    }
  }

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Giải đấu của tôi ({myTournaments.length})</h3>
              <button className="btn small primary" onClick={() => setCreateOpen((v) => !v)}>
                {createOpen ? "← Đóng" : "➕ Mở giải mới"}
              </button>
            </div>

            {myTournaments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)" }}>
                <div style={{ fontSize: "40px", marginBottom: "8px" }}>📜</div>
                <p>Bạn chưa mở giải đấu nào.</p>
                <button className="btn primary" onClick={() => setCreateOpen(true)}>
                  Tạo giải đấu đầu tiên ngay!
                </button>
              </div>
            ) : (
              myTournaments.map((t) => (
                <div key={t.id} className="tour-item-card">
                  <div>
                    <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--text)" }}>
                      {t.name}
                      <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>
                        {t.code}
                      </span>
                    </h4>
                    <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <span>🎮 Game: {t.gameName}</span>
                      <span>
                        👥 {t.registered}
                        {t.capacity ? `/${t.capacity}` : ""} người
                      </span>
                      <span>⏰ Khởi tranh: {formatStartsAt(t.startsAt)}</span>
                      {t.languages?.length > 0 && <span>🌐 {languageLabels(t.languages)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`tour-status-badge ${TOUR_STATUS[t.status]?.className ?? "upcoming"}`}>
                      {TOUR_STATUS[t.status]?.label ?? t.status}
                    </span>
                    <button className="btn small" onClick={() => onOpenTournament?.(t.id)}>
                      Vào phòng chờ
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Form mở giải đấu mới (ẩn/hiện trong tab Trang cá nhân, ghi thẳng vào server) */}
        {activeTab === "profile" && createOpen && (
          <div style={{ marginTop: "18px", borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: "16px" }}>
            <h3 style={{ margin: "0 0 8px" }}>Mở giải đấu cá nhân / cộng đồng</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "var(--muted)" }}>
              Giải đấu có hiệu lực ngay sau khi tạo. Luật chơi bạn điền ở đây sẽ hiện trong phòng
              chờ của giải cho người tham gia đọc.
            </p>

            {msg && (
              <div
                className="auth-error"
                style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534", marginBottom: "14px" }}
              >
                {msg}
              </div>
            )}
            {formError && (
              <div className="auth-error" style={{ marginBottom: "14px" }}>
                {formError}
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

                <div className="reg-field">
                  <label>
                    Số lượng người tham gia (Tối đa: <strong>128</strong>)
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="number"
                      min={2}
                      max={128}
                      className="reg-input"
                      value={maxTeams}
                      onChange={(e) => setMaxTeams(e.target.value)}
                      style={{ width: "120px" }}
                      required
                    />
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>người</span>
                  </div>
                  {/* Các nút bấm chọn nhanh quy mô */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                    {[4, 8, 16, 32, 64, 128].map((num) => (
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
                        {num} người
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="reg-field">
                <label>Ngôn ngữ bot được phép *</label>
                <div className="reg-lang-options">
                  {BOT_LANGUAGES.map((option) => {
                    const checked = languages.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`reg-lang ${checked ? "is-checked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLanguage(option.id)}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="reg-hint">
                  Bot dự thi phải viết bằng một trong các ngôn ngữ đã chọn.
                </p>
              </div>

              <div className="form-grid-2">
                <div className="reg-field">
                  <label>Ngày bắt đầu *</label>
                  <input
                    type="date"
                    className="reg-input"
                    min={todayInputValue()}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="reg-field">
                  <label>Giờ bắt đầu *</label>
                  <input
                    type="time"
                    className="reg-input"
                    value={startClock}
                    onChange={(e) => setStartClock(e.target.value)}
                    required
                  />
                </div>
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

              <div className="reg-field">
                <label>Mô tả ngắn về giải đấu</label>
                <textarea
                  className="reg-textarea"
                  placeholder="Giải đấu dành cho ai, thể thức loại trực tiếp, cách tính điểm..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>

              <div className="reg-field">
                <label>Luật chơi (mỗi dòng một điều luật)</label>
                <textarea
                  className="reg-textarea"
                  rows={5}
                  placeholder={"Ví dụ:\nMỗi trận đấu 1 ván, thắng đi tiếp\nKhông được gọi mạng trong lúc thi đấu\nTrọng tài là chủ giải"}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                />
                <p className="reg-hint">
                  Người tham gia sẽ đọc phần luật này trong phòng chờ của giải, tối đa 20 dòng.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  type="submit"
                  className="btn primary"
                  style={{ padding: "10px 24px" }}
                  disabled={creating}
                >
                  {creating ? "Đang tạo giải…" : "🚀 Mở giải đấu"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(false)}
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: CÀI ĐẶT — liên kết tài khoản + mật khẩu */}
        {activeTab === "settings" && (
          <div style={{ maxWidth: "520px" }}>
            {/* Liên kết tài khoản */}
            <section style={{ margin: "0 0 22px", padding: "16px", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12 }}>
              <h3 style={{ margin: "0 0 8px" }}>Tài khoản đã liên kết</h3>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
                Email hoặc số điện thoại và Google/Facebook giúp bạn đăng nhập lại vào cùng hồ sơ người chơi.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["google", "facebook"].map((provider) => {
                  const linked = (user?.linked_accounts ?? []).some((item) => item.provider === provider);
                  return (
                    <button key={provider} type="button" className="btn secondary" disabled={linked || !!linkingProvider} onClick={async () => {
                      setLinkMessage(""); setLinkingProvider(provider);
                      try { await onLinkAccount?.(provider); setLinkMessage(`${provider === "google" ? "Google" : "Facebook"} đã liên kết.`); }
                      catch (error) { setLinkMessage(error.message || "Không liên kết được tài khoản."); }
                      finally { setLinkingProvider(""); }
                    }}>{linkingProvider === provider ? "Đang kết nối…" : linked ? `${provider === "google" ? "Google" : "Facebook"} đã liên kết` : `Liên kết ${provider === "google" ? "Google" : "Facebook"}`}</button>
                  );
                })}
                <span className="btn secondary" aria-disabled="true">Số điện thoại: {user?.phone ? "đã có" : "cần xác minh SMS"}</span>
              </div>
              {linkMessage && <p role="status" style={{ margin: "10px 0 0", fontSize: 13 }}>{linkMessage}</p>}
            </section>

            {/* Mật khẩu: "Thêm mật khẩu" nếu chưa có (đăng nhập Google), ngược lại "Đổi mật khẩu" */}
            <section style={{ padding: "16px", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12 }}>
              <h3 style={{ margin: "0 0 8px" }}>{hasPassword ? "🔒 Đổi mật khẩu" : "➕ Thêm mật khẩu"}</h3>
              <p style={{ margin: "0 0 18px", fontSize: "13.5px", color: "var(--muted)" }}>
                {hasPassword
                  ? "Nhập mật khẩu hiện tại rồi chọn mật khẩu mới (tối thiểu 8 ký tự) để bảo vệ tài khoản."
                  : "Bạn đang đăng nhập bằng Google/Facebook và chưa có mật khẩu. Đặt mật khẩu (tối thiểu 8 ký tự) để có thể đăng nhập bằng email."}
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

              <form onSubmit={hasPassword ? handleChangePasswordSubmit : handleSetPasswordSubmit} className="tournament-reg-form">
                <div className="reg-field">
                  <label>Tên đăng nhập</label>
                  <input
                    type="text"
                    className="reg-input"
                    value={user?.email || user?.phone || user?.identifier || ""}
                    readOnly
                    autoComplete="username"
                  />
                </div>

                {hasPassword && (
                  <div className="reg-field">
                    <label>Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      className="reg-input"
                      placeholder="Nhập mật khẩu hiện tại"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={isChangingPass}
                      required
                    />
                  </div>
                )}

                <div className="reg-field">
                  <label>Mật khẩu mới</label>
                  <input
                    type="password"
                    className="reg-input"
                    placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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
                    {isChangingPass ? "Đang xử lý..." : hasPassword ? "🔒 Đổi mật khẩu" : "➕ Thêm mật khẩu"}
                  </button>
                </div>
              </form>
            </section>
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
