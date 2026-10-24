import { useCallback, useEffect, useState } from "react";
import { getTournamentNotifications, markTournamentNotificationRead, getPlayerInvitations, respondToPlayerInvitation } from "../../api.js";
import { GAME_CATALOG } from "../../games/catalog.js";

const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "Chưa lên lịch";
const labels = { schedule: "Lịch giải", match: "Trận đấu", result: "Kết quả", champion: "Nhà vô địch", status: "Cập nhật", game: "Game mới" };

const GAME_READ_KEY = "botvui.read-game-announcements";
const CACHE_TTL_MS = 90_000;
const cacheKey = userId => `botvui.tournament-notifications.v1:${userId || "unknown"}`;
function readCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(userId)) || "null");
    return cached && Array.isArray(cached.items) ? cached : null;
  } catch { return null; }
}
const gameNotices = GAME_CATALOG.filter(game => game.categories?.includes("new")).map(game => ({
  id: `game:${game.id}`, type: "game", title: game.available ? `Game mới: ${game.name}` : `Sắp ra mắt: ${game.name}`,
  message: game.shortDesc, game_id: game.id, target_type: "game", created_at: null,
}));

export default function TournamentNotifications({ token, userId, onOpenTarget, onUnreadChange, onInvitationAccepted, compact = false, onViewAll, onClose }) {
  const [data, setData] = useState(() => {
    const cached = readCache(userId);
    return cached ? { items: cached.items, unread: cached.unread ?? 0 } : { items: [], unread: 0 };
  });
  const [filter, setFilter] = useState("all");
  const [readGames, setReadGames] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GAME_READ_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    const cached = readCache(userId);
    return !cached || Date.now() - (cached.fetchedAt ?? 0) >= CACHE_TTL_MS;
  });
  const [error, setError] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [respondingTo, setRespondingTo] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const next = await getTournamentNotifications(token);
      setData(next);
      localStorage.setItem(cacheKey(userId), JSON.stringify({ ...next, fetchedAt: Date.now() }));
    }
    catch (e) { setError(e.message || "Không tải được thông báo giải đấu."); }
    finally { setLoading(false); }
  }, [token, userId]);
  useEffect(() => {
    const cached = readCache(userId);
    if (!cached || Date.now() - (cached.fetchedAt ?? 0) >= CACHE_TTL_MS) load();
    else setLoading(false);
  }, [load, userId]);
  const loadInvitations = useCallback(async () => {
    try { setInvitations((await getPlayerInvitations(token)).items ?? []); }
    catch (e) { setError(e.message || "Không tải được lời mời."); }
  }, [token]);
  useEffect(() => {
    loadInvitations();
    const timer = window.setInterval(loadInvitations, 25_000);
    return () => window.clearInterval(timer);
  }, [loadInvitations]);

  const items = [...gameNotices.map(item => ({ ...item, read_at: readGames.includes(item.id) ? "local" : null })), ...(data.items ?? [])]
    .sort((a, b) => new Date(b.scheduled_at ?? b.created_at ?? 0) - new Date(a.scheduled_at ?? a.created_at ?? 0));
  const unread = (data.unread ?? 0) + gameNotices.filter(item => !readGames.includes(item.id)).length + invitations.length;
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);
  const visibleItems = compact && filter === "unread" ? items.filter(item => !item.read_at) : items;

  const markRead = async (id) => {
    if (String(id).startsWith("game:")) {
      const next = [...new Set([...readGames, id])];
      setReadGames(next); localStorage.setItem(GAME_READ_KEY, JSON.stringify(next)); return;
    }
    try {
      await markTournamentNotificationRead(id, token);
      const next = { ...data, unread: Math.max(0, data.unread - 1), items: data.items.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item) };
      setData(next);
      localStorage.setItem(cacheKey(userId), JSON.stringify({ ...next, fetchedAt: Date.now() }));
    }
    catch (e) { setError(e.message || "Không cập nhật được trạng thái thông báo."); }
  };

  const openTarget = async item => {
    if (!item.read_at) await markRead(item.id);
    onOpenTarget?.(item);
  };

  async function respondToInvite(invitation, decision) {
    setRespondingTo(invitation.id); setError("");
    try {
      const result = await respondToPlayerInvitation(invitation.id, decision, token);
      setInvitations(current => current.filter(item => item.id !== invitation.id));
      if (decision === "accept") onInvitationAccepted?.(result);
    } catch (e) { setError(e.message || "Không xử lý được lời mời."); }
    finally { setRespondingTo(null); }
  }

  const invitationList = invitations.length > 0 && <section className="notification-invites" aria-label="Lời mời đang chờ">
    <h3>Lời mời đang chờ</h3>
    {invitations.map(invitation => <article className="notification-invite" key={invitation.id}>
      <span className="notification-popover__icon" aria-hidden="true">{invitation.type === "team" ? "👥" : "⚔️"}</span>
      <div className="notification-invite__body">
        <strong>{invitation.sender_name} mời bạn {invitation.type === "team" ? `vào đội ${invitation.team_name}` : `đấu ${invitation.game_name}`}</strong>
        <span>{invitation.type === "team" ? "Chấp nhận để tham gia đội." : `Phòng ${invitation.room_code} · hết hạn sau 24 giờ.`}</span>
        <div className="notification-invite__actions">
          <button type="button" className="btn small primary" disabled={respondingTo === invitation.id} onClick={() => respondToInvite(invitation, "accept")}>{respondingTo === invitation.id ? "Đang xử lý…" : "Chấp nhận"}</button>
          <button type="button" className="btn small" disabled={respondingTo === invitation.id} onClick={() => respondToInvite(invitation, "decline")}>Từ chối</button>
        </div>
      </div>
    </article>)}
  </section>;

  if (compact) return <section className="notification-popover" aria-label="Thông báo">
    <div className="notification-popover__heading">
      <h2>Thông báo</h2>
      <button className="notification-popover__close" onClick={onClose} aria-label="Đóng thông báo">×</button>
    </div>
    <div className="notification-popover__filters">
      <div className="notification-popover__tabs" role="tablist" aria-label="Lọc thông báo">
        <button role="tab" aria-selected={filter === "all"} className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Tất cả</button>
        <button role="tab" aria-selected={filter === "unread"} className={filter === "unread" ? "selected" : ""} onClick={() => setFilter("unread")}>Chưa đọc{unread > 0 ? ` (${unread})` : ""}</button>
      </div>
      <button className="notification-popover__view-all" onClick={onViewAll}>Xem tất cả</button>
    </div>
    {error && <p className="notification-error" role="alert">{error}</p>}
    {invitationList}
    <div className="notification-popover__list" aria-live="polite">
      {loading && !visibleItems.length ? <p className="notification-popover__empty">Đang tải thông báo…</p> : visibleItems.length ? visibleItems.map(item => <button
        type="button" key={item.id} className={`notification-popover__item ${item.read_at ? "is-read" : "is-unread"}`}
        onClick={() => openTarget(item)}>
        <span className="notification-popover__icon" aria-hidden="true">{item.type === "game" ? "🎮" : item.type === "match" ? "⚔️" : item.type === "result" || item.type === "champion" ? "🏆" : "🎟️"}</span>
        <span className="notification-popover__content">
          <strong>{item.title}</strong>
          {item.message && <span className="notification-popover__message">{item.message}</span>}
          <span className="notification-popover__time">{formatDate(item.scheduled_at ?? item.created_at)}</span>
        </span>
        {!item.read_at && <span className="notification-popover__unread-dot" aria-label="Chưa đọc" />}
      </button>) : <p className="notification-popover__empty">{filter === "unread" ? "Bạn đã đọc hết thông báo." : "Chưa có thông báo mới."}</p>}
    </div>
  </section>;

  return <section className="tournament-notifications">
    <div className="tournament-notifications-heading">
      <div><h2>Thông báo</h2><p>{unread} thông báo chưa đọc</p></div>
      <button className="btn small" onClick={load} disabled={loading}>↻ Làm mới</button>
    </div>
    {invitationList}
    {error && <p className="notification-error" role="alert">{error}</p>}
    {loading ? <p>Đang tải thông báo…</p> : items.length ? <div className="notification-table-wrap">
      <table className="notification-table">
        <thead><tr><th>Thông báo</th><th>Loại</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id} className={item.read_at ? "" : "unread"}>
          <td><strong>{item.title}</strong><div className="notification-message">{item.message}</div></td>
          <td>{labels[item.type] ?? item.type}</td>
          <td>{formatDate(item.scheduled_at ?? item.created_at)}</td>
          <td>{item.read_at ? "Đã đọc" : "Chưa đọc"}</td>
          <td className="notification-actions">
            <button className="btn small" onClick={() => openTarget(item)}>{item.type === "game" ? "Mở game" : item.type === "schedule" && item.metadata?.status === "open" && item.metadata?.registrationOpen !== false ? "Đăng ký ngay" : item.type === "schedule" && item.metadata?.status === "open" ? "Xem lịch giải" : item.type === "schedule" && item.metadata?.status === "in_progress" ? "Xem giải" : item.metadata?.roundNo ? `Mở vòng ${item.metadata.roundNo}` : "Mở giải"}</button>
            {!item.read_at && <button className="btn small" onClick={() => markRead(item.id)}>Đã đọc</button>}
          </td>
        </tr>)}</tbody>
      </table>
    </div> : <p>Chưa có thông báo. Giải mới, lịch mở đăng ký, trận sắp diễn ra và kết quả sẽ xuất hiện tại đây.</p>}
  </section>;
}
