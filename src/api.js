// Mọi lệnh gọi HTTP API đều dùng chung một địa chỉ gốc: API_URL (lấy từ VITE_API_URL).
// - Local: để trống VITE_API_URL, Vite sẽ proxy /api tới Node server (xem vite.config.js).
// - Production (Vercel): đặt VITE_API_URL = origin backend, ví dụ https://<railway-domain>.
import { API_URL } from "./api/index.js";

const baseUrl = (API_URL ?? "").replace(/\/+$/, "");

async function request(path, { method = "GET", token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.message || data.error || `HTTP ${response.status}`);
        error.code = data.error;
        error.status = response.status;
        throw error;
    }
    return data;
}

const get = (path, options = {}) => request(path, options);
const post = (path, body, token) => request(path, { method: "POST", body, token });

export const getRankings = () => get("/api/rankings");

export function sessionToken() {
    try { return JSON.parse(localStorage.getItem("daubot_session") ?? "null")?.token ?? null; }
    catch { return null; }
}

export const getMe = () => get("/api/me", { token: sessionToken() });
export const getGames = () => get("/api/games");
export function getTournaments({ status, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status !== undefined) params.set("status", status);
    return get(`/api/tournaments?${params}`);
}
export const getTournament = (idOrCode) => get(`/api/tournaments/${encodeURIComponent(idOrCode)}`);
export const createTournament = (payload, token) => post("/api/tournaments", payload, token);
export const registerTournament = (idOrCode, token) =>
    post(`/api/tournaments/${encodeURIComponent(idOrCode)}/entries`, {}, token);
export const startTournament = (idOrCode, token) =>
    post(`/api/tournaments/${encodeURIComponent(idOrCode)}/start`, {}, token);
export const attachTournamentSlotResult = (idOrCode, roundNo, slotIndex, matchId, token) =>
    post(`/api/tournaments/${encodeURIComponent(idOrCode)}/rounds/${roundNo}/slots/${slotIndex}/result`,
        { match_id: matchId }, token);
export const recordTournamentMatch = (tournamentId, result, token) =>
    post(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`, result, token);
export const updateTournamentStatus = (tournamentId, { status, champion_id = null }, token) =>
    request(`/api/tournaments/${encodeURIComponent(tournamentId)}/status`, {
        method: "PATCH", body: { status, champion_id }, token,
    });
export const getUserProfile = (userId) => get(`/api/users/${encodeURIComponent(userId)}`);
export const getBotSubmissions = (roomCode, token, { limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return get(`/api/rooms/${encodeURIComponent(roomCode)}/submissions?${params}`, { token });
}
export function getMatches({ teamId, status, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (teamId !== undefined) params.set("teamId", teamId);
    if (status !== undefined) params.set("status", status);
    return get(`/api/matches?${params}`);
}
export const getMatch = (id) => get(`/api/matches/${encodeURIComponent(id)}`);
export const getMatchReplay = (id) => get(`/api/matches/${encodeURIComponent(id)}/replay`);
