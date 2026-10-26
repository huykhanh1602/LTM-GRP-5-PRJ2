import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMatchReplay, getTournament } from "../api.js";
import { apiErrorText, toTournamentView } from "../utils/tournamentApi.js";

// Chu kỳ tự làm mới dữ liệu giải đấu (ms) và các trạng thái đã kết thúc (không cần poll nữa).
const POLL_MS = 5000;
const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

// ─────────────────────────────────────────────────────────────
// Quản lý toàn bộ trạng thái của phòng chờ giải đấu:
// tải dữ liệu, đăng ký/khởi tranh, mở replay, mở modal.
// ─────────────────────────────────────────────────────────────
export function useTournamentLobby({
  tournamentId = null,
  user = null,
  token = null,
  onOpenReplay,
  onRequireLogin,
}) {
  const [pickedId, setPickedId] = useState(null);
  const activeId = tournamentId ?? pickedId;

  const [raw, setRawState] = useState(null);
  // Tăng mỗi khi dữ liệu được ghi bởi hành động của người dùng; poll dùng nó để bỏ kết quả cũ.
  const rawVersion = useRef(0);
  const setRaw = useCallback((value) => {
    rawVersion.current += 1;
    setRawState(value);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("standings");
  const [profileId, setProfileId] = useState(null);
  const [teamModal, setTeamModal] = useState(false);
  const [adminModal, setAdminModal] = useState(false);

  const load = useCallback(async () => {
    const data = await getTournament(activeId);
    setRaw(data);
    return data;
  }, [activeId, setRaw]);

  useEffect(() => {
    if (!activeId) {
      setRaw(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .catch((err) => active && setError(apiErrorText(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [activeId, load]);

  const busyRef = useRef(false);
  busyRef.current = busy;

  // Tự làm mới định kỳ để giao diện theo kịp khi trạng thái giải đấu đổi từ phía server
  // (đến giờ tự khởi tranh, trận kết thúc, người tổ chức mở/đóng đăng ký...).
  // Làm mới "im lặng": không bật loading, không ghi `error` (tránh thay cả trang bằng màn hình lỗi).
  const polling = Boolean(activeId && raw && !TERMINAL_STATUSES.has(raw.status));
  useEffect(() => {
    if (!polling) return undefined;
    let cancelled = false;
    let inflight = false;

    const tick = async () => {
      if (cancelled || inflight || busyRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inflight = true;
      const startedAt = rawVersion.current;
      try {
        const data = await getTournament(activeId);
        // Bỏ kết quả nếu đã đổi giải hoặc người dùng vừa thao tác (dữ liệu mới hơn).
        if (cancelled || rawVersion.current !== startedAt) return;
        setRawState((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      } catch {
        // Lỗi mạng thoáng qua: giữ nguyên giao diện, lần poll sau sẽ thử lại.
      } finally {
        inflight = false;
      }
    };

    const timer = setInterval(tick, POLL_MS);
    const onWake = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [polling, activeId]);

  const tournament = useMemo(
    () => (raw ? toTournamentView(raw, user?.id) : null),
    [raw, user?.id],
  );

  async function run(action, successText) {
    if (!token) {
      onRequireLogin?.();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setRaw(await action());
      setMessage({ tone: "ok", text: successText });
    } catch (err) {
      setMessage({ tone: "err", text: apiErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function openReplay(matchId) {
    if (!matchId) return;
    setMessage(null);
    try {
      onOpenReplay?.(await getMatchReplay(matchId));
    } catch (err) {
      setMessage({ tone: "err", text: apiErrorText(err) });
    }
  }

  return {
    pickedId,
    setPickedId,
    activeId,
    raw,
    setRaw,
    loading,
    error,
    message,
    setMessage,
    busy,
    tab,
    setTab,
    profileId,
    setProfileId,
    teamModal,
    setTeamModal,
    adminModal,
    setAdminModal,
    tournament,
    load,
    run,
    openReplay,
  };
}