// ─────────────────────────────────────────────────────────────
// useTopMatch — My Match Banner hook.
// Lấy trận hiện tại của user trong giải đang diễn ra, polling
// realtime; cung cấp setReady + submitRoundBot + đếm ngược cửa sổ nộp code.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMyTournamentMatch, setMyMatchReady, submitMyMatchRoundBot } from "../api.js";
import { apiErrorText } from "../utils/tournamentApi.js";

const POLL_MS = 4000;

export function useTopMatch({ tournamentId = null, token = null, enabled = true }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(null); // ISO (PER_ROUND)
  const [submitting, setSubmitting] = useState(false);
  const pollTimer = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const load = useCallback(async () => {
    if (!tournamentId || !enabled) return null;
    setLoading(true);
    try {
      const data = await getMyTournamentMatch(tournamentId, tokenRef.current);
      setMatch(data);
      setError(null);
      return data;
    } catch (err) {
      if (err?.status !== 401) setError(apiErrorText(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [tournamentId, enabled]);

  // Poll định kỳ để cập nhật trạng thái sẵn sàng của 2 phía realtime.
  useEffect(() => {
    if (!tournamentId || !enabled) {
      setMatch(null);
      return undefined;
    }
    load();
    pollTimer.current = setInterval(load, POLL_MS);
    return () => {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [tournamentId, enabled, load]);

  // Bắt đầu đếm ngược cửa sổ nộp code khi chuyển vòng (PER_ROUND).
  const [roundKey, setRoundKey] = useState(null);
  useEffect(() => {
    if (!match?.found) {
      setDeadline(null);
      setRoundKey(null);
      return;
    }
    const key = `${match.roundNo}:${match.slotIndex}`;
    if (key !== roundKey) {
      setRoundKey(key);
      setDeadline(
        match.mode === "PER_ROUND"
          ? new Date(Date.now() + (match.submissionWindowMinutes ?? 10) * 60 * 1000).toISOString()
          : null,
      );
    }
  }, [match, roundKey]);

  const setReady = useCallback(
    async (ready = true) => {
      if (!tournamentId || !token) {
        setError("Bạn cần đăng nhập để bấm Sẵn sàng.");
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const data = await setMyMatchReady(tournamentId, ready, token);
        setMatch(data);
        return data;
      } catch (err) {
        setError(apiErrorText(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [tournamentId, token],
  );

  const submitRoundBot = useCallback(
    async ({ roundNo, filename, source }) => {
      if (!tournamentId || !token) {
        setError("Bạn cần đăng nhập để nộp code.");
        return null;
      }
      setSubmitting(true);
      setError(null);
      try {
        const data = await submitMyMatchRoundBot(tournamentId, roundNo, { filename, source }, token);
        setMatch((prev) => (prev?.found ? { ...prev, me: { ...prev.me, submitted: true, filename } } : prev));
        return data;
      } catch (err) {
        setError(apiErrorText(err));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [tournamentId, token],
  );

  return useMemo(
    () => ({ match, loading, error, busy, submitting, deadline, refresh: load, setReady, submitRoundBot }),
    [match, loading, error, busy, submitting, deadline, load, setReady, submitRoundBot],
  );
}