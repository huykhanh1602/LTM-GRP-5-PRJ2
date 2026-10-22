import { useState } from "react";
import "../styles/auth.css";

export default function AuthModal({ isOpen, onClose, onLogin, onRegister, onLoginGoogle }) {
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!identifier.trim()) {
      return setError("Vui lòng nhập Email hoặc Số điện thoại.");
    }
    if (!password) {
      return setError("Vui lòng nhập mật khẩu.");
    }
    if (isRegister) {
      if (!displayName.trim()) {
        return setError("Vui lòng nhập tên hiển thị.");
      }
      if (password.length < 6) {
        return setError("Mật khẩu phải từ 6 ký tự trở lên.");
      }
      if (password !== confirmPassword) {
        return setError("Mật khẩu xác nhận không khớp.");
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        await onRegister(displayName.trim(), identifier.trim(), password);
      } else {
        await onLogin(identifier.trim(), password);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Đã xảy ra lỗi, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleClick() {
    setLoading(true);
    setError("");
    try {
      if (onLoginGoogle) {
        await onLoginGoogle();
        onClose();
      }
    } catch (err) {
      setError(err.message || "Đăng nhập Google thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFacebookClick() {
    setLoading(true);
    setError("");
    try {
      if (onLoginFacebook) {
        await onLoginFacebook();
        onClose();
      }
    } catch (err) {
      setError(err.message || "Đăng nhập Facebook thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>

        <h2 className="auth-title">
          {isRegister ? "Đăng ký tài khoản" : "Đăng nhập tài khoản"}
        </h2>
        <div className="auth-divider" />

        {/* ── ĐĂNG NHẬP NHANH QUA MẠNG XÃ HỘI (GOOGLE / FACEBOOK) ── */}
        <div className="auth-social-buttons">
          <button
            type="button"
            className="auth-google-btn"
            onClick={handleGoogleClick}
            disabled={loading}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Tiếp tục với Google</span>
          </button>

          <button
            type="button"
            className="auth-facebook-btn"
            onClick={handleFacebookClick}
            disabled={loading}
          >
            <svg className="facebook-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span>Tiếp tục với Facebook</span>
          </button>
        </div>

        <div className="auth-social-divider">
          <span>hoặc bằng Email / SĐT</span>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-field-label">
            {isRegister ? "Email hoặc Số điện thoại" : "Đăng nhập bằng Email/Số điện thoại"}
          </label>
          <input
            type="text"
            className="auth-input"
            placeholder="Nhập Email/Số điện thoại đăng nhập"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
          />

          {isRegister && (
            <>
              <label className="auth-field-label">Tên hiển thị / Tên Bot</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Nhập tên hiển thị của bạn"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </>
          )}

          <input
            type="password"
            className="auth-input"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          {isRegister && (
            <input
              type="password"
              className="auth-input"
              placeholder="Xác nhận mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmNewPassword ? setConfirmPassword(e.target.value) : setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-btn-submit" disabled={loading}>
            {loading ? "Đang xử lý..." : isRegister ? "Đăng ký" : "Đăng nhập"}
          </button>

          <div className="auth-footer-links">
            {isRegister ? (
              <p>
                Đã có tài khoản?{" "}
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => {
                    setIsRegister(false);
                    setError("");
                  }}
                >
                  Đăng nhập
                </button>
              </p>
            ) : (
              <>
                <p>
                  Bạn chưa có tài khoản?{" "}
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setIsRegister(true);
                      setError("");
                    }}
                  >
                    Đăng ký
                  </button>
                </p>
                <button
                  type="button"
                  className="auth-link-secondary"
                  onClick={() => alert("Chức năng khôi phục đang kết nối SMS/Email OTP.")}
                >
                  Lấy lại tài khoản?
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
