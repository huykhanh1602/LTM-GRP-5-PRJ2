// Đăng nhập Google bằng Google Identity Services, KHÔNG có nút riêng: dùng hộp thoại One Tap
// của Google tự hiện ở góc trên phải trang. Chọn tài khoản xong, id_token được đổi lấy token phiên
// của server (POST /api/auth/google). Cần VITE_GOOGLE_CLIENT_ID; thiếu thì bỏ qua, vẫn chơi bằng khách.

export const GOOGLE_CLIENT_ID = (import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? "").trim();

// Đổi id_token của Google lấy { token, user } của server. Lỗi thì throw Error có câu báo lỗi.
export async function exchangeGoogleCredential(credential, { apiUrl = "", fetchImpl = fetch } = {}) {
  const base = typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const url = new URL(`${apiUrl.replace(/\/+$/, "")}/api/auth/google`, base);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: credential }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Lỗi ${res.status}`);
  return body;
}

let loading = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      loading = null;
      reject(new Error("Không tải được thư viện đăng nhập Google."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// Hiện hộp thoại One Tap. onSession({ token, user }) khi thành công, onError(message) khi lỗi.
export async function promptGoogleSignIn({ apiUrl, onSession, onError }) {
  if (!GOOGLE_CLIENT_ID) return;
  try {
    const google = await loadGoogleScript();
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: true,
      cancel_on_tap_outside: false,
      callback: async ({ credential }) => {
        try {
          onSession(await exchangeGoogleCredential(credential, { apiUrl }));
        } catch (e) {
          onError?.(`Đăng nhập Google thất bại: ${e.message}`);
        }
      },
    });
    google.accounts.id.prompt();
  } catch (e) {
    onError?.(e.message);
  }
}

export function googleSignOut() {
  window.google?.accounts?.id?.disableAutoSelect();
}
