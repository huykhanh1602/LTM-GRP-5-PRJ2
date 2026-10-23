import { useState } from "react";

// Quản lý toàn bộ state + submit của form mật khẩu (đổi mật khẩu / thêm mật khẩu).
export function usePasswordSettings({ isLoggedIn, onChangePassword, onSetPassword }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState({ type: "", text: "" });
  const [isChangingPass, setIsChangingPass] = useState(false);

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

  return {
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
  };
}