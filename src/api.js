// Vite proxies /api to the game server. Production must use the same reverse proxy.
const baseUrl = import.meta.env.VITE_API_BASE_URL || '';

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

export const getRankings = () => get('/api/rankings');
export function getMatches({ teamId, status, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (teamId !== undefined) params.set('teamId', teamId);
  if (status !== undefined) params.set('status', status);
  return get(`/api/matches?${params}`);
}
export const getMatch = id => get(`/api/matches/${encodeURIComponent(id)}`);
export const getMatchReplay = id => get(`/api/matches/${encodeURIComponent(id)}/replay`);
