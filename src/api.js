// Mọi lệnh gọi HTTP API đều dùng chung một địa chỉ gốc: API_URL (lấy từ VITE_API_URL).
// - Local: để trống VITE_API_URL, Vite sẽ proxy /api tới Node server (xem vite.config.js).
// - Production (Vercel): đặt VITE_API_URL = origin backend, ví dụ https://<railway-domain>.
import { API_URL } from "./api/index.js";

const baseUrl = (API_URL ?? "").replace(/\/+$/, "");

// Tiền tố phiên bản cho các endpoint dữ liệu giải đấu / game.
// Backend chấp nhận cả /api/v1/* và /api/* (xem net/http.js).
const V1 = "/api/v1";

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
export const getGames = () => get(`${V1}/games`);
export function getTournaments({ status, limit = 20, offset = 0, joined = false } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status !== undefined) params.set("status", status);
    if (joined) params.set("joined", "1");
    return get(`${V1}/tournaments?${params}`, joined ? { token: sessionToken() } : {});
}
export const getTournamentNotifications = (token, { limit = 100, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return get(`${V1}/notifications/tournaments?${params}`, { token });
};
export const markTournamentNotificationRead = (id, token) =>
    request(`${V1}/notifications/tournaments/${encodeURIComponent(id)}/read`, { method: "PATCH", token });
export const getTournament = (idOrCode) => get(`${V1}/tournaments/${encodeURIComponent(idOrCode)}`);
export const createTournament = (payload, token) => post(`${V1}/tournaments`, payload, token);
export const registerTournament = (idOrCode, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/entries`, {}, token);
export const registerTournamentTeam = (idOrCode, teamId, token, submissionId = null) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/entries`,
        { team_id: teamId, submission_id: submissionId }, token);
// ── Đội: tạo Đội, xem thành viên, thêm thành viên, đổi bot đại diện ──
export const createTeam = (name, token) => post(`${V1}/teams`, { name }, token);
export const getTeam = (id, token) => get(`${V1}/teams/${encodeURIComponent(id)}`, { token });
export const addTeamMember = (id, userId, token) =>
    post(`${V1}/teams/${encodeURIComponent(id)}/members`, { user_id: userId }, token);
export const removeTeamMember = (id, userId, token) =>
    request(`${V1}/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE", token,
    });
export const getPlayerInvitations = (token) => get(`${V1}/invitations`, { token });
export const sendPlayerInvitation = (payload, token) => post(`${V1}/invitations`, payload, token);
export const respondToPlayerInvitation = (id, decision, token) =>
    request(`${V1}/invitations/${encodeURIComponent(id)}`, { method: "PATCH", body: { decision }, token });
export const setEntrySubmission = (tournamentId, { teamId = null, userId = null, submissionId }, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(tournamentId)}/entries/submission`, {
        method: "PATCH", body: { team_id: teamId, user_id: userId, submission_id: submissionId }, token,
    });
export const startTournament = (idOrCode, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/start`, {}, token);
export const updateTournamentSchedule = (idOrCode, scheduledAt, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/schedule`, {
        method: "PATCH", body: { scheduled_at: scheduledAt }, token,
    });
// Kiểu điều khiển giải cho phép: BOT / HUMAN / BOTH (không đụng tới lịch khởi tranh).
export const updateTournamentControls = (idOrCode, allowedControls, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/schedule`, {
        method: "PATCH", body: { allowed_controls: allowedControls }, token,
    });
export const updateRegistrationWindow = (tournamentId, { registrationOpensAt, registrationClosesAt, startsAt = null }, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(tournamentId)}/registration-window`, {
        method: "PATCH", body: { registrationOpensAt, registrationClosesAt, startsAt }, token,
    });
export const updateRoundSchedule = (idOrCode, roundId, scheduledAt, autoStart, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/rounds`, {
        method: "PATCH", body: { round_id: roundId, scheduled_at: scheduledAt, auto_start: autoStart }, token,
    });
export const triggerRoundStart = (idOrCode, roundId, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/rounds/trigger-start`, { round_id: roundId }, token);
export const rescheduleMatch = (matchId, scheduledAt, token) =>
    post(`${V1}/matches/${encodeURIComponent(matchId)}/reschedule`, { scheduled_at: scheduledAt }, token);
export const attachTournamentSlotResult = (idOrCode, roundNo, slotIndex, matchId, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/rounds/${roundNo}/slots/${slotIndex}/result`,
        { match_id: matchId }, token);
export const recordTournamentMatch = (tournamentId, result, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(tournamentId)}/matches`, result, token);
export const updateTournamentStatus = (tournamentId, { status, champion_id = null }, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(tournamentId)}/status`, {
        method: "PATCH", body: { status, champion_id }, token,
    });
export const searchUsers = (q) => get(`${V1}/users/search?q=${encodeURIComponent(q)}`);
export const getUserProfile = (userId) => get(`/api/users/${encodeURIComponent(userId)}`);
export const getBotSubmissions = (roomCode, token, { limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return get(`/api/rooms/${encodeURIComponent(roomCode)}/submissions?${params}`, { token });
}
export const createBotSubmission = (roomCode, filename, source, token) => {
    const url = `${baseUrl}/api/rooms/${encodeURIComponent(roomCode)}/submissions?filename=${encodeURIComponent(filename)}`;
    return fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: source,
    }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.message || data.error || `HTTP ${response.status}`);
            error.code = data.error;
            error.status = response.status;
            throw error;
        }
        return data;
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
// ── My Match Banner: trận hiện tại của tôi trong giải đang diễn ra ──
export const getMyTournamentMatch = (idOrCode, token) =>
    get(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/my-match`, { token });
export const setMyMatchReady = (idOrCode, ready, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/my-match/ready`, {
        method: "POST", body: { ready }, token,
    });
export const submitMyMatchRoundBot = (idOrCode, roundNo, { filename, source }, token) =>
    request(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/my-match/submission`, {
        method: "POST", body: { round_no: roundNo, filename, source }, token,
    });
export const resolveTournamentRound = (idOrCode, roundNo, token) =>
    post(`${V1}/tournaments/${encodeURIComponent(idOrCode)}/rounds/${roundNo}/resolve`, {}, token);
