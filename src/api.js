// Mọi lệnh gọi HTTP API đều dùng chung một địa chỉ gốc: API_URL (lấy từ VITE_API_URL).
// - Local: để trống VITE_API_URL, Vite sẽ proxy /api tới Node server (xem vite.config.js).
// - Production (Vercel): đặt VITE_API_URL = origin backend, ví dụ https://<railway-domain>.
import { API_URL } from "./api/index.js";

const baseUrl = (API_URL ?? "").replace(/\/+$/, "");

async function get(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
}

export const getRankings = () => get("/api/rankings");
export const getMe = () => {
    let token;
    try { token = JSON.parse(localStorage.getItem("daubot_session") ?? "null")?.token; }
    catch { token = undefined; }
    return get("/api/me", token ? { headers: { Authorization: `Bearer ${token}` } } : {});
};
export const getGames = () => get("/api/games");
export function getTournaments({ status, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status !== undefined) params.set("status", status);
    return get(`/api/tournaments?${params}`);
}
export const getTournament = (idOrCode) => get(`/api/tournaments/${encodeURIComponent(idOrCode)}`);
export const recordTournamentMatch = (tournamentId, result, token) => get(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(result),
});
export const updateTournamentStatus = (tournamentId, { status, champion_id = null }, token) => get(`/api/tournaments/${encodeURIComponent(tournamentId)}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status, champion_id }),
});
export function getBotSubmissions(roomCode, token, { limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return get(`/api/rooms/${encodeURIComponent(roomCode)}/submissions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
}
export function getMatches({ teamId, status, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (teamId !== undefined) params.set("teamId", teamId);
    if (status !== undefined) params.set("status", status);
    return get(`/api/matches?${params}`);
}
export const getMatch = (id) => get(`/api/matches/${encodeURIComponent(id)}`);
export const getMatchReplay = (id) => get(`/api/matches/${encodeURIComponent(id)}/replay`);
