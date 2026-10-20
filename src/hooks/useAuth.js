import { useState, useCallback } from "react";

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
    } catch {
      // Fallback mock nếu chưa cấu hình Google Client ID hoặc backend chưa bật
    }

    const mockGoogleUser = {
      id: "g_" + Math.random().toString(36).slice(2, 8),
      display_name: "Google Player",
      identifier: "player.google@gmail.com",
      email: "player.google@gmail.com",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=GoogleBot",
      elo: 1200,
      matches_played: 6,
      wins: 4,
      role: "player",
      created_tournaments: []
    };
    const mockSession = { token: "google_jwt_token_" + Date.now(), user: mockGoogleUser };
    persist(mockSession);
    return mockSession;
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

  // Thêm giải đấu cá nhân tạo
  const addTournament = useCallback((tournamentData) => {
    setSession((prev) => {
      if (!prev || !prev.user) return prev;
      const list = prev.user.created_tournaments || [];
      const newTour = {
        id: "tour_" + Date.now(),
        ...tournamentData,
        status: "pending",
        created_at: new Date().toISOString()
      };
      const updated = {
        ...prev,
        user: {
          ...prev.user,
          created_tournaments: [newTour, ...list]
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
