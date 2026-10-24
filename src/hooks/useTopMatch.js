// ─────────────────────────────────────────────────────────────
// useTopMatch — My Match Banner hook.
// Lấy trận hiện tại của user trong giải đang diễn ra, polling
// realtime; đếm ngược cửa sổ nộp code; tự xử lý hết giờ (xử thua/random).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMyTournamentMatch, resolveTournamentRound } from "../api.js";
import { apiErrorText } from "../utils/tournamentApi.js";

const POLL_MS = 4000;

export function useTopMatch({ tournamentId = null, token = null, enabled = true, onResolved }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(null); // ISO (server cung cấp khi mở vòng)
  const pollTimer = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const resolvedRef = useRef(new Set()); // tránh gọi resolve lặp cho cùng (roundNo, deadline)
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const load = useCallback(async () => {
    if (!tournamentId || !enabled) return null;
    setLoading(true);
    try {
      const data = await getMyTournamentMatch(tournamentId, tokenRef.current);
      setMatch(data);
      setError(null);
      if (data?.found) {
        const dl = data.submissionDeadline;
        setDeadline(dl && !Number.isNaN(new Date(dl).getTime()) ? dl : null);
      } else {
        setDeadline(null);
      }
      return data;
    } catch (err) {
      if (err?.status !== 401) setError(apiErrorText(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tournamentId, enabled]);

  useEffect(() => {
    if (!tournamentId || !enabled) {
      setMatch(null);
      setDeadline(null);
      return undefined;
    }
    load();
    pollTimer.current = setInterval(load, POLL_MS);
    return () => {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [tournamentId, enabled, load]);

  // Hết giờ nộp code: yêu cầu backend xử lý (xử thua / random nếu cả 2 chưa nộp).
  useEffect(() => {
    if (!match?.found || match.isParticipant === false || !deadline || match.matchId || match.bothReady) return;
    const timeout = new Date(deadline).getTime() - Date.now();
    if (timeout > 0) return;
    const key = `${match.tournamentId}:${match.roundNo}`;
    if (resolvedRef.current.has(key)) return;
    resolvedRef.current.add(key);
    const timer = setTimeout(async () => {
      try {
        setBusy(true);
        const result = await resolveTournamentRound(match.tournamentId, match.roundNo, tokenRef.current);
        onResolvedRef.current?.(result);
        await load();
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [match, deadline, load]);

  // Bắt đầu mới khi đổi vòng: reset cờ resolve của vòng cũ.
  useEffect(() => {
    if (match?.found) {
      const key = `${match.tournamentId}:${match.roundNo}`;
      for (const existing of resolvedRef.current) {
        if (existing !== key && existing.startsWith(`${match.tournamentId}:`)) resolvedRef.current.delete(existing);
      }
    }
  }, [match]);

  return useMemo(
    () => ({ match, loading, error, busy, deadline, refresh: load }),
    [match, loading, error, busy, deadline, load],
  );
}