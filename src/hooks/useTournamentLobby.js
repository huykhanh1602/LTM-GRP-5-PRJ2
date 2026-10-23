import { useCallback, useEffect, useMemo, useState } from "react";
import { getMatchReplay, getTournament } from "../api.js";
import { apiErrorText, toTournamentView } from "../utils/tournamentApi.js";

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

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("standings");
  const [profileId, setProfileId] = useState(null);
  const [attachSlot, setAttachSlot] = useState(null);
  const [teamModal, setTeamModal] = useState(false);
  const [adminModal, setAdminModal] = useState(false);

  const load = useCallback(async () => {
    const data = await getTournament(activeId);
    setRaw(data);
    return data;
  }, [activeId]);

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
    attachSlot,
    setAttachSlot,
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