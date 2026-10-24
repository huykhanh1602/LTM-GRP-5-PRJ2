import { useCallback, useEffect, useState } from "react";
import { getTournamentNotifications, markTournamentNotificationRead } from "../../api.js";
import { GAME_CATALOG } from "../../games/catalog.js";

const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "Chưa lên lịch";
const labels = { schedule: "Lịch giải", match: "Trận đấu", result: "Kết quả", champion: "Nhà vô địch", status: "Cập nhật", game: "Game mới" };

const GAME_READ_KEY = "botvui.read-game-announcements";
const gameNotices = GAME_CATALOG.filter(game => game.categories?.includes("new")).map(game => ({
  id: `game:${game.id}`, type: "game", title: game.available ? `Game mới: ${game.name}` : `Sắp ra mắt: ${game.name}`,
  message: game.shortDesc, game_id: game.id, target_type: "game", created_at: null,
}));

export default function TournamentNotifications({ token, onOpenTarget, onUnreadChange }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [readGames, setReadGames] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GAME_READ_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await getTournamentNotifications(token)); }
    catch (e) { setError(e.message || "Không tải được thông báo giải đấu."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const items = [...gameNotices.map(item => ({ ...item, read_at: readGames.includes(item.id) ? "local" : null })), ...(data.items ?? [])]
    .sort((a, b) => new Date(b.scheduled_at ?? b.created_at ?? 0) - new Date(a.scheduled_at ?? a.created_at ?? 0));
  const unread = (data.unread ?? 0) + gameNotices.filter(item => !readGames.includes(item.id)).length;
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  const markRead = async (id) => {
    if (String(id).startsWith("game:")) {
      const next = [...new Set([...readGames, id])];
      setReadGames(next); localStorage.setItem(GAME_READ_KEY, JSON.stringify(next)); return;
    }
    try { await markTournamentNotificationRead(id, token); await load(); }
    catch (e) { setError(e.message || "Không cập nhật được trạng thái thông báo."); }
  };

  const openTarget = async item => {
    if (!item.read_at) await markRead(item.id);
    onOpenTarget?.(item);
  };

  return <section className="tournament-notifications">
    <div className="tournament-notifications-heading">
      <div><h2>Thông báo</h2><p>{unread} thông báo chưa đọc</p></div>
      <button className="btn small" onClick={load} disabled={loading}>↻ Làm mới</button>
    </div>
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
