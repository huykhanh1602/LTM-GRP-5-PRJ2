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

// ─────────────────────────────────────────────────────────────
// Modal chọn avatar: preset, tải ảnh lên, hoặc dán link.
// ─────────────────────────────────────────────────────────────
export default function AvatarModal({ editor }) {
  const {
    isOpen,
    close,
    selectedAvatar,
    setSelectedAvatar,
    customAvatarUrl,
    setCustomAvatarUrl,
    handleSaveAvatar,
    handleAvatarFileUpload,
  } = editor;

  if (!isOpen) return null;

  return (
    <div className="auth-overlay" onClick={close}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <button
          className="auth-close"
          onClick={close}
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
            onClick={close}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}