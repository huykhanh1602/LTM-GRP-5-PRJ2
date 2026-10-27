import { useState } from "react";
import { resolveEntry } from "../../utils/tournamentView.js";
import Modal from "./Modal.jsx";

// ─────────────────────────────────────────────────────────────
// Danh sách trận vừa kết thúc / đang diễn ra
// ─────────────────────────────────────────────────────────────
export default function MatchFeed({
  feed = [],
  myEntryId = null,
  entryMap = null,
  roundNo = null,
  onReplay,
  onSpectate,
}) {
  const [resultMatch, setResultMatch] = useState(null);
  const visibleFeed = roundNo
    ? feed.filter(match => Number(match.roundNo ?? String(match.round ?? "").match(/\d+/)?.[0]) === Number(roundNo))
    : feed;
  if (!Array.isArray(visibleFeed) || visibleFeed.length === 0) {
    return (
      <div className="tl-empty tl-empty--compact">
        <span className="tl-empty__icon" aria-hidden="true">🕹️</span>
        <h3>Chưa có trận nào</h3>
        <p>Khi giải khởi tranh, toàn bộ diễn biến và replay sẽ xuất hiện tại đây.</p>
      </div>
    );
  }

  return (
    <>
    <ul className="tl-feed">
      {visibleFeed.map((match) => {
        const a = resolveEntry(entryMap, match.a);
        const b = resolveEntry(entryMap, match.b);
        const isLive = match.status === "live";
        const isUpcoming = match.status === "upcoming";
        const winnerIsA = Boolean(match.winnerId) && match.winnerId === match.a;
        const winnerIsB = Boolean(match.winnerId) && match.winnerId === match.b;
        const involvesMe = match.a === myEntryId || match.b === myEntryId;
        const scoreA = match.score?.a ?? 0;
        const scoreB = match.score?.b ?? 0;
        const replayId = match.replayId ?? match.matchId;

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
                  onClick={() => replayId ? onReplay?.(match) : setResultMatch(match)}
                  disabled={isUpcoming}
                  title={replayId ? "Phát lại các lượt đã lưu" : "Trận này chỉ lưu kết quả, không có dữ liệu lượt chơi"}
                >
                  {replayId ? "⟲ Xem trận" : "📋 Xem kết quả"}
                </button>
              )}
              <code>{String(match.matchId ?? match.id ?? "").replace("M-KBB-", "")}</code>
            </div>
          </li>
        );
      })}
    </ul>
    {resultMatch && (() => {
      const resultA = resolveEntry(entryMap, resultMatch.a);
      const resultB = resolveEntry(entryMap, resultMatch.b);
      const winner = resultMatch.winnerId === resultMatch.a
        ? resultA?.teamName ?? resultMatch.a
        : resultMatch.winnerId === resultMatch.b
          ? resultB?.teamName ?? resultMatch.b
          : null;
      const reason = resultMatch.result?.reason;
      const explanation = resultMatch.result?.forfeit || reason === "FORFEIT"
        ? "Trận được xử lý do một bên không nộp bot đúng hạn. Không có lượt chơi để phát lại."
        : reason === "RANDOM"
          ? "Kết quả được hệ thống xử lý vì hai bên chưa nộp bot đúng hạn. Không có lượt chơi để phát lại."
          : "Bản lưu chỉ có kết quả trận đấu, không có dữ liệu lượt chơi để phát lại.";
      return (
        <Modal
          title="Kết quả trận đấu"
          subtitle={resultMatch.round || "Trận trong giải đấu"}
          onClose={() => setResultMatch(null)}
        >
          <div className="tl-modal__scoreboard">
            <div className="tl-modal__team"><strong>{resultA?.teamName ?? resultMatch.a ?? "—"}</strong></div>
            <div className="tl-modal__score">
              <b>{resultMatch.score ? resultMatch.score.a : "–"}</b>
              <span>vs</span>
              <b>{resultMatch.score ? resultMatch.score.b : "–"}</b>
            </div>
            <div className="tl-modal__team"><strong>{resultB?.teamName ?? resultMatch.b ?? "—"}</strong></div>
          </div>
          <p className="tl-modal__note">
            {winner ? <>Người thắng: <strong>{winner}</strong>. </> : "Trận hòa. "}
            {explanation}
          </p>
        </Modal>
      );
    })()}
    </>
  );
}
