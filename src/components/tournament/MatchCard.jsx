import { useEffect, useState } from "react";
import { resolveEntry } from "../../utils/tournamentView.js";

const STATUS_META = {
  pending: { label: "Chờ xác định", tone: "pending" },
  ready: { label: "Sẵn sàng", tone: "ready" },
  running: { label: "Live", tone: "live" },
  done: { label: "Kết thúc", tone: "done" },
  bye: { label: "Bye", tone: "bye" },
};

function pad(value) {
  return String(value).padStart(2, "0");
}

// Đếm ngược tới scheduled_at của trận đấu
function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return { ended: true, hours: 0, minutes: 0, seconds: 0 };
  return {
    ended: false,
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function CountdownChip({ target }) {
  const countdown = useCountdown(target);
  if (!countdown) return null;
  if (countdown.ended) {
    return <span className="tl-match__countdown is-ended">▶ Đã bắt đầu</span>;
  }
  return (
    <span className="tl-match__countdown" title={`Bắt đầu: ${new Date(target).toLocaleString("vi-VN")}`}>
      ⏱ {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
    </span>
  );
}

function TeamRow({ entry, fallbackName, score, isWinner, isMe }) {
  const name = entry ? entry.teamName : fallbackName;
  return (
    <div
      className={[
        "tl-team-row",
        isWinner ? "is-winner" : "",
        isMe ? "is-me" : "",
        !entry && !fallbackName ? "is-empty" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {entry ? (
        <img className="tl-team-row__avatar" src={entry.avatar} alt="" loading="lazy" />
      ) : (
        <span className="tl-team-row__avatar tl-team-row__avatar--empty">?</span>
      )}

      <span className="tl-team-row__name">{name ?? "Chờ xác định"}</span>
      {isMe && <span className="tl-me-tag">Bạn</span>}
      <b className={`tl-team-row__score ${isWinner ? "is-win" : ""}`}>
        {score === null || score === undefined ? "–" : score}
      </b>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card một trận đấu trong giải (dùng cho bracket & lịch vòng tròn)
// ─────────────────────────────────────────────────────────────
export default function MatchCard({
  match,
  title,
  isFinal = false,
  isThirdPlace = false,
  myEntryId = null,
  entryMap = null,
  onSpectate,
  onReplay,
}) {
  const meta = STATUS_META[match.status] ?? STATUS_META.pending;
  const scoreA = match.score?.a ?? null;
  const scoreB = match.score?.b ?? null;
  const winnerA = Boolean(match.winnerId) && match.winnerId === match.participantAId;
  const winnerB = Boolean(match.winnerId) && match.winnerId === match.participantBId;

  const entryA = resolveEntry(entryMap, match.participantAId);
  const entryB = resolveEntry(entryMap, match.participantBId);

  return (
    <article className={`tl-match tl-match--${meta.tone} ${isFinal ? "tl-match--final" : ""} ${isThirdPlace ? "tl-match--third" : ""}`}>
      <header className="tl-match__head">
        <span className="tl-match__label">
          {title ?? `Trận ${match.matchIndex + 1}`}
        </span>
        <span className={`tl-match__status tl-match__status--${meta.tone}`}>
          {meta.tone === "live" && <i className="tl-pulse" aria-hidden="true" />}
          {meta.label}
        </span>
      </header>

      <div className="tl-match__teams">
        <TeamRow
          entry={entryA}
          fallbackName={match.participantAName}
          score={scoreA}
          isWinner={winnerA}
          isMe={match.participantAId === myEntryId}
        />
        <TeamRow
          entry={entryB}
          fallbackName={match.participantBName}
          score={scoreB}
          isWinner={winnerB}
          isMe={match.participantBId === myEntryId}
        />
      </div>

      <footer className="tl-match__foot">
        {match.status === "running" && (
          <button
            type="button"
            className="tl-match__action tl-match__action--live"
            onClick={() => onSpectate?.(match)}
          >
            ▶ Xem trực tiếp
          </button>
        )}

        {match.status === "done" && (
          <button
            type="button"
            className="tl-match__action"
            onClick={() => onReplay?.(match)}
            disabled={!match.replayId && !match.matchId}
          >
            ⟲ Xem trận đấu
          </button>
        )}

        {match.status === "ready" && (
          <>
            {match.scheduledAt ? (
              <CountdownChip target={match.scheduledAt} />
            ) : (
              <span className="tl-match__waiting">⏳ Chờ kết quả trận đấu</span>
            )}
          </>
        )}

        {match.status === "pending" && (
          <span className="tl-match__waiting">Chờ kết quả nhánh trước</span>
        )}

        {match.status === "bye" && <span className="tl-match__waiting">Đi thẳng vòng sau</span>}

        {match.matchId && (
          <code className="tl-match__id" title="Mã trận đấu">
            {String(match.matchId).replace("M-KBB-", "")}
          </code>
        )}
      </footer>
    </article>
  );
}
