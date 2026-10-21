import { useCallback, useEffect, useState } from "react";
import { API_URL, MOCK } from "../api/index.js";
import { GOOGLE_CLIENT_ID, googleSignOut, promptGoogleSignIn } from "../api/googleAuth.js";

// Giữ phiên đăng nhập Google của tab hiện tại: { token, user } hoặc null.
// Phiên chỉ nằm trong bộ nhớ, tải lại trang thì Google tự đăng nhập lại (auto_select).
export function useGoogleSession() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const enabled = Boolean(GOOGLE_CLIENT_ID) && !MOCK;

  useEffect(() => {
    if (!enabled) return;
    void promptGoogleSignIn({ apiUrl: API_URL, onSession: setSession, onError: setError });
  }, [enabled]);

  const signOut = useCallback(() => {
    googleSignOut();
    setSession(null);
  }, []);

  return { session, error, enabled, signOut };
}
