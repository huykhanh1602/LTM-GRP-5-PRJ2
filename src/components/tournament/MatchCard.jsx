import { resolveEntry } from "../../utils/tournamentView.js";

const STATUS_META = {
  pending: { label: "Chờ xác định", tone: "pending" },
  ready: { label: "Sẵn sàng", tone: "ready" },
  running: { label: "Live", tone: "live" },
  done: { label: "Kết thúc", tone: "done" },
  bye: { label: "Bye", tone: "bye" },
};

function TeamRow({ entry, score, isWinner, isMe }) {
  return (
    <div
      className={[
        "tl-team-row",
        isWinner ? "is-winner" : "",
        isMe ? "is-me" : "",
        !entry ? "is-empty" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {entry ? (
        <img className="tl-team-row__avatar" src={entry.avatar} alt="" loading="lazy" />
      ) : (
        <span className="tl-team-row__avatar tl-team-row__avatar--empty">?</span>
      )}

      <span className="tl-team-row__name">{entry ? entry.teamName : "Chờ xác định"}</span>
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
    <article className={`tl-match tl-match--${meta.tone} ${isFinal ? "tl-match--final" : ""}`}>
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
          score={scoreA}
          isWinner={winnerA}
          isMe={match.participantAId === myEntryId}
        />
        <TeamRow
          entry={entryB}
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
          <span className="tl-match__waiting">⏳ Chờ kết quả trận đấu</span>
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
