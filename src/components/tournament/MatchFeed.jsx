import { resolveEntry } from "../../utils/tournamentView.js";

// ─────────────────────────────────────────────────────────────
// Danh sách trận vừa kết thúc / đang diễn ra
// ─────────────────────────────────────────────────────────────
export default function MatchFeed({
  feed = [],
  myEntryId = null,
  entryMap = null,
  onReplay,
  onSpectate,
}) {
  if (!Array.isArray(feed) || feed.length === 0) {
    return (
      <div className="tl-empty tl-empty--compact">
        <span className="tl-empty__icon" aria-hidden="true">🕹️</span>
        <h3>Chưa có trận nào</h3>
        <p>Khi giải khởi tranh, toàn bộ diễn biến và replay sẽ xuất hiện tại đây.</p>
      </div>
    );
  }

  return (
    <ul className="tl-feed">
      {feed.map((match) => {
        const a = resolveEntry(entryMap, match.a);
        const b = resolveEntry(entryMap, match.b);
        const isLive = match.status === "live";
        const isUpcoming = match.status === "upcoming";
        const winnerIsA = Boolean(match.winnerId) && match.winnerId === match.a;
        const winnerIsB = Boolean(match.winnerId) && match.winnerId === match.b;
        const involvesMe = match.a === myEntryId || match.b === myEntryId;
        const scoreA = match.score?.a ?? 0;
        const scoreB = match.score?.b ?? 0;

        return (
          <li
            key={match.id ?? match.matchKey}
            className={[isLive ? "is-live" : "", involvesMe ? "is-me" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="tl-feed__meta">
              <span className={`tl-feed__round ${match.isFinal ? "is-final" : ""}`}>
                {match.round || "—"}
              </span>
              <time>{match.startedAt ?? "—"}</time>
              {isLive ? (
                <span className="tl-feed__live">
                  <i className="tl-pulse" aria-hidden="true" /> Live
                </span>
              ) : isUpcoming ? (
                <span className="tl-feed__done">Sắp diễn ra</span>
              ) : (
                <span className="tl-feed__done">Kết thúc</span>
              )}
            </div>

            <div className="tl-feed__score">
              <span className={`tl-feed__team ${winnerIsA ? "is-win" : ""}`}>
                {a?.teamName ?? "—"}
                <b>{match.score ? scoreA : "–"}</b>
              </span>
              <span className="tl-feed__vs">vs</span>
              <span className={`tl-feed__team ${winnerIsB ? "is-win" : ""}`}>
                <b>{match.score ? scoreB : "–"}</b>
                {b?.teamName ?? "—"}
              </span>
            </div>

            <div className="tl-feed__actions">
              {isLive ? (
                <button
                  type="button"
                  className="btn small tl-btn-live"
                  onClick={() => onSpectate?.(match)}
                >
                  ▶ Xem trực tiếp
                </button>
              ) : (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => onReplay?.(match)}
                  disabled={isUpcoming || (!match.replayId && !match.matchId)}
                >
                  ⟲ Xem trận
                </button>
              )}
              <code>{String(match.matchId ?? match.id ?? "").replace("M-KBB-", "")}</code>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
