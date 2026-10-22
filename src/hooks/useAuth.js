import { useState, useCallback } from "react";
import { saveNewTournament } from "../utils/tournaments.js";

// ─────────────────────────────────────────────────────────────
// useAuth — Quản lý trạng thái đăng nhập, profile & bảo mật
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "daubot_session";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getApiBase() {
  return import.meta.env.VITE_API_URL ?? "http://localhost:3000";
}

function loadScript(src, ready) {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    const script = existing || Object.assign(document.createElement("script"), { src, async: true });
    if (!existing) document.head.appendChild(script);
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Không tải được thư viện đăng nhập.")), { once: true });
  });
}

async function googleCredential() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google chưa được cấu hình trên giao diện.");
  await loadScript("https://accounts.google.com/gsi/client", () => !!window.google?.accounts?.id);
  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({ client_id: clientId, callback: result => result.credential ? resolve(result.credential) : reject(new Error("Google không trả thông tin đăng nhập.")) });
    window.google.accounts.id.prompt(notification => { if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) reject(new Error("Không mở được cửa sổ Google. Hãy thử lại.")); });
  });
}

let fbInitialized = false;

async function facebookCredential() {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
  if (!appId) {
    throw new Error("Facebook chưa được cấu hình trên giao diện (thiếu VITE_FACEBOOK_APP_ID trong .env).");
  }
  await loadScript("https://connect.facebook.net/vi_VN/sdk.js", () => !!window.FB);
  if (!fbInitialized && window.FB) {
    window.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: "v20.0",
    });
    fbInitialized = true;
  }
  return new Promise((resolve, reject) => {
    window.FB.login(
      (result) => {
        if (result.authResponse?.accessToken) {
          resolve(result.authResponse.accessToken);
        } else {
          reject(new Error("Bạn chưa cấp quyền đăng nhập Facebook hoặc đã hủy thao tác."));
        }
      },
      { scope: "public_profile,email" }
    );
  });
}

export function useAuth() {
  const [session, setSession] = useState(loadSession);

  const user = session?.user ?? null;
  const token = session?.token ?? null;
  const isLoggedIn = !!token && user?.role !== "guest";

  function persist(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSession(data);
  }

  // Đăng xuất
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  // Đăng nhập bằng Email / SĐT + mật khẩu
  const login = useCallback(async (identifier, password) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.token) {
        persist(json);
        return json;
      }
    } catch {
      // Fallback mock nếu backend chưa chạy
    }

    const mockUser = {
      id: "u_" + Math.random().toString(36).slice(2, 8),
      display_name: identifier.split("@")[0] || identifier,
      identifier,
      email: identifier.includes("@") ? identifier : null,
      phone: !identifier.includes("@") ? identifier : null,
      avatar: "/icons.png",
      elo: 1250,
      matches_played: 14,
      wins: 9,
      role: "player",
      created_tournaments: [
        {
          id: "tour_demo_1",
          name: "Giải Tân Binh Kéo Búa Bao v1",
          game_id: "rps_chess",
          participants: 8,
          status: "pending",
          start_time: "2026-10-25 19:30",
        }
      ]
    };
    const mockSession = { token: "mock_jwt_token_" + Date.now(), user: mockUser };
    persist(mockSession);
    return mockSession;
  }, []);

  // Đăng ký tài khoản
  const register = useCallback(async (displayName, identifier, password) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, identifier, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.token) {
        persist(json);
        return json;
      }
    } catch {
      // Fallback mock
    }

    const mockUser = {
      id: "u_" + Math.random().toString(36).slice(2, 8),
      display_name: displayName || identifier.split("@")[0] || identifier,
      identifier,
      email: identifier.includes("@") ? identifier : null,
      phone: !identifier.includes("@") ? identifier : null,
      avatar: "/icons.png",
      elo: 1000,
      matches_played: 0,
      wins: 0,
      role: "player",
      created_tournaments: []
    };
    const mockSession = { token: "mock_jwt_token_" + Date.now(), user: mockUser };
    persist(mockSession);
    return mockSession;
  }, []);

  // Đăng nhập nhanh bằng Google
  const loginGoogle = useCallback(async (idToken) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken || "mock_google_id_token" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.token) {
        persist(json);
        return json;
      }
      throw new Error(json.error === "GOOGLE_NOT_CONFIGURED" ? "Đăng nhập Google chưa được cấu hình trên máy chủ." : "Google chưa xác minh được tài khoản.");
    } catch (err) {
      if (err.message && err.message !== "Failed to fetch") throw err;
      throw new Error("Không thể kết nối máy chủ đăng nhập Google.");
    }
  }, []);

  const loginFacebook = useCallback(async () => {
    try {
      const accessToken = await facebookCredential();
      const res = await fetch(`${getApiBase()}/api/auth/facebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.token) {
        persist(json);
        return json;
      }
      throw new Error(
        json.error === "FACEBOOK_NOT_CONFIGURED"
          ? "Facebook chưa được cấu hình trên máy chủ (thiếu FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)."
          : json.error === "INVALID_PROVIDER_TOKEN"
            ? "Mã truy cập Facebook không hợp lệ hoặc đã hết hạn."
            : "Facebook chưa xác minh được tài khoản."
      );
    } catch (err) {
      if (err.message && err.message !== "Failed to fetch") throw err;
      throw new Error("Không thể kết nối máy chủ đăng nhập Facebook.");
    }
  }, []);

  // Cập nhật thông tin profile (tên, avatar...)
  const updateProfile = useCallback((patch) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        user: { ...prev.user, ...patch },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Đổi mật khẩu
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Đổi mật khẩu thất bại.");
      return json;
    } catch (err) {
      if (err.message && !err.message.includes("Failed to fetch")) {
        throw err;
      }
      return { success: true, message: "Đổi mật khẩu thành công!" };
    }
  }, [token]);

  // Thêm giải đấu cá nhân tạo (không cần duyệt, có hiệu lực ngay)
  const addTournament = useCallback((tournamentData) => {
    setSession((prev) => {
      const currentUser = prev?.user;
      const createdTour = saveNewTournament(tournamentData, currentUser);
      if (!currentUser) return prev;
      const list = currentUser.created_tournaments || [];
      const updated = {
        ...prev,
        user: {
          ...currentUser,
          created_tournaments: [createdTour, ...list]
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return {
    user,
    token,
    isLoggedIn,
    login,
    register,
    loginGoogle,
    logout,
    updateProfile,
    changePassword,
    addTournament,
  };
}
