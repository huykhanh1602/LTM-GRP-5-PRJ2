import { useState } from "react";

// Quản lý toàn bộ state của modal chọn/tải Avatar.
export function useAvatarModal({ user, onUpdateProfile }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "/icons.png");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");

  function open() {
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  // Xử lý lưu avatar
  function handleSaveAvatar() {
    const finalAvatar = customAvatarUrl.trim() || selectedAvatar;
    onUpdateProfile({ avatar: finalAvatar });
    setIsOpen(false);
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

  return {
    isOpen,
    open,
    close,
    selectedAvatar,
    setSelectedAvatar,
    customAvatarUrl,
    setCustomAvatarUrl,
    handleSaveAvatar,
    handleAvatarFileUpload,
  };
}