import { useState } from "react";

// ─────────────────────────────────────────────────────────────
// Tab Cài đặt: liên kết tài khoản + mật khẩu.
// ─────────────────────────────────────────────────────────────
export default function ProfileSettingsPanel({
  user,
  hasPassword,
  password,
  onLinkAccount,
}) {
  const {
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    confirmNewPassword,
    setConfirmNewPassword,
    passwordMsg,
    isChangingPass,
    handleChangePasswordSubmit,
    handleSetPasswordSubmit,
  } = password;

  const [linkMessage, setLinkMessage] = useState("");
  const [linkingProvider, setLinkingProvider] = useState("");

  async function handleLink(provider) {
    setLinkMessage("");
    setLinkingProvider(provider);
    try {
      await onLinkAccount?.(provider);
      setLinkMessage(`${provider === "google" ? "Google" : "Facebook"} đã liên kết.`);
    } catch (error) {
      setLinkMessage(error.message || "Không liên kết được tài khoản.");
    } finally {
      setLinkingProvider("");
    }
  }

  return (
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
              <button
                key={provider}
                type="button"
                className="btn secondary"
                disabled={linked || !!linkingProvider}
                onClick={() => handleLink(provider)}
              >
                {linkingProvider === provider
                  ? "Đang kết nối…"
                  : linked
                    ? `${provider === "google" ? "Google" : "Facebook"} đã liên kết`
                    : `Liên kết ${provider === "google" ? "Google" : "Facebook"}`}
              </button>
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
              type="email"
              className="reg-input"
              name="username"
              value={user?.email || user?.phone || user?.identifier || ""}
              onChange={() => {}}
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
  );
}