import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../api/index.js";
import { normalizeLiveMessage } from "../utils/tournamentView.js";

const INITIAL = {
  connection: "disabled", // disabled | connecting | reconnecting | online | offline
  updates: [], // [{ key, patch }] — patch slot realtime
  lastMessageAt: null,
  error: null,
};

const MAX_RETRIES = 5;

// ─────────────────────────────────────────────────────────────
// Đăng ký nhận cập nhật realtime cho một giải đấu.
// Server gửi: { type: "tournament_state", tournament } hoặc
//             { type: "slot_updated", payload: { slots: [...] } }
// Mọi payload chứa matchKey/matchId + status/score đều được ghép vào bracket.
// ─────────────────────────────────────────────────────────────
export function useTournamentLive({
  tournamentId,
  enabled = true,
  url = WS_URL,
  onSnapshot,
} = {}) {
  const [state, setState] = useState(INITIAL);
  const snapshotRef = useRef(onSnapshot);
  snapshotRef.current = onSnapshot;

  useEffect(() => {
    if (!enabled || !tournamentId) {
      setState(INITIAL);
      return undefined;
    }

    let socket = null;
    let cancelled = false;
    let retry = 0;
    let reconnectTimer = null;

    function pushUpdates(updates) {
      setState((prev) => {
        const merged = new Map(prev.updates.map((item) => [item.key, item]));
        for (const update of updates) merged.set(update.key, update);
        return {
          ...prev,
          updates: [...merged.values()],
          lastMessageAt: Date.now(),
        };
      });
    }

    function connect() {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        connection: retry === 0 ? "connecting" : "reconnecting",
        error: null,
      }));

      try {
        socket = new WebSocket(`${String(url).replace(/\/+$/, "")}/ws`);
      } catch (error) {
        setState((prev) => ({ ...prev, connection: "offline", error: error.message }));
        return;
      }

      socket.onopen = () => {
        retry = 0;
        setState((prev) => ({ ...prev, connection: "online", error: null }));
        socket.send(
          JSON.stringify({
            type: "watch_tournament",
            tournament_id: tournamentId,
            tournamentId,
          }),
        );
      };

      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        const parsed = normalizeLiveMessage(message);
        if (!parsed) return;
        if (parsed.snapshot) snapshotRef.current?.(parsed.snapshot);
        if (parsed.updates?.length) pushUpdates(parsed.updates);
      };

      socket.onerror = () => {
        setState((prev) => ({ ...prev, connection: "offline" }));
      };

      socket.onclose = () => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, connection: "offline" }));
        if (retry < MAX_RETRIES) {
          retry += 1;
          reconnectTimer = setTimeout(connect, Math.min(1500 * retry, 8000));
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [enabled, tournamentId, url]);

  return state;
}

export default useTournamentLive;
