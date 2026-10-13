import sampleReplay from "../mock/sample-v2.json";
import { createMockChannel } from "./mockServer.js";
import { createSocketChannel } from "./socket.js";

// Cấu hình qua file .env ở gốc project; VITE_USE_MOCK=true để dùng server giả.
const defaultWsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Origin backend dùng chung cho MỌI lệnh gọi HTTP API (xem src/api.js).
// Local: để trống -> Vite proxy /api tới Node server.
// Production (Vercel): đặt https://<railway-domain>, không có dấu / ở cuối.
export const API_URL = (import.meta.env.VITE_API_URL ?? "").trim();

// Suy ra WS_URL từ API_URL khi không cấu hình VITE_WS_URL, tránh trường hợp
// trình duyệt cố kết nối WebSocket tới chính domain giao diện (ví dụ Vercel:3000).
function resolveWsUrl() {
    const explicit = (import.meta.env.VITE_WS_URL ?? "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    if (API_URL) {
        try {
            const url = new URL(API_URL, window.location.href);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            url.pathname = "";
            url.search = "";
            url.hash = "";
            return url.toString().replace(/\/+$/, "");
        } catch {
            // API_URL không hợp lệ -> dùng mặc định bên dưới.
        }
    }
    return `${defaultWsProtocol}//${window.location.hostname}:3000`;
}

export const WS_URL = resolveWsUrl();
export const MOCK = import.meta.env.VITE_USE_MOCK === "true";

export function connect(params) {
    if (MOCK) return createMockChannel({ ...params, replay: sampleReplay });
    return createSocketChannel({ ...params, wsUrl: WS_URL, httpUrl: API_URL });
}
