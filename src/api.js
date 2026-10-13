// Mọi lệnh gọi HTTP API đều dùng chung một địa chỉ gốc: API_URL (lấy từ VITE_API_URL).
// - Local: để trống VITE_API_URL, Vite sẽ proxy /api tới Node server (xem vite.config.js).
// - Production (Vercel): đặt VITE_API_URL = origin backend, ví dụ https://<railway-domain>.
import { API_URL } from "./api/index.js";

const baseUrl = (API_URL ?? "").replace(/\/+$/, "");

async function get(path) {
    const response = await fetch(`${baseUrl}${path}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
}

export const getRankings = () => get("/api/rankings");
export function getMatches({ teamId, status, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (teamId !== undefined) params.set("teamId", teamId);
    if (status !== undefined) params.set("status", status);
    return get(`/api/matches?${params}`);
}
export const getMatch = (id) => get(`/api/matches/${encodeURIComponent(id)}`);
export const getMatchReplay = (id) => get(`/api/matches/${encodeURIComponent(id)}/replay`);
