import MatchCard from "./MatchCard.jsx";
import LiveStatus from "./LiveStatus.jsx";

// ─────────────────────────────────────────────────────────────
// Thể thức Round Robin: lịch thi đấu theo từng vòng
// ─────────────────────────────────────────────────────────────
export default function RoundRobinSchedule({
  rounds = [],
  roundLabels = [],
  entryMap = null,
  myEntryId = null,
  live = null,
  onSpectate,
  onReplay,
}) {
  const totalMatches = rounds.reduce((sum, matches) => sum + matches.length, 0);

  return (
    <section className="tl-card tl-rr-card" aria-label="Lịch thi đấu vòng tròn">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">Lịch thi đấu vòng tròn</h2>
          <p className="tl-card__desc">
            Round Robin · {rounds.length} vòng · {totalMatches} trận · mỗi cặp bot gặp nhau một lượt.
          </p>
        </div>
        <div className="tl-card__aside">
          <LiveStatus
            connection={live?.connection ?? "disabled"}
            lastMessageAt={live?.lastMessageAt}
          />
          <span className="tl-bracket__legend">
            <i className="tl-legend-dot tl-legend-dot--live" /> Live
            <i className="tl-legend-dot tl-legend-dot--ready" /> Sẵn sàng
            <i className="tl-legend-dot tl-legend-dot--done" /> Kết thúc
          </span>
        </div>
      </header>

      {rounds.length === 0 ? (
        <div className="tl-empty">
          <span className="tl-empty__icon" aria-hidden="true">📅</span>
          <h3>Chưa có lịch thi đấu</h3>
          <p>Lịch vòng tròn sẽ được tạo ngay khi BTC chốt danh sách và bắt đầu giải.</p>
        </div>
      ) : (
        <div className="tl-rr-rounds">
          {rounds.map((matches, roundIndex) => {
            const finished = matches.filter((match) => match.status === "done").length;
            const isRoundLive = matches.some((match) => match.status === "running");

            return (
              <div
                key={`rr-round-${roundIndex}`}
                className={`tl-rr-round ${isRoundLive ? "is-live" : ""}`}
              >
                <div className="tl-rr-round__head">
                  <span className="tl-rr-round__name">
                    {roundLabels[roundIndex] ?? `Vòng ${roundIndex + 1}`}
                  </span>
                  <span className="tl-rr-round__count">{matches.length} trận</span>
                  <span className="tl-rr-round__progress">
                    {finished}/{matches.length} kết thúc
                  </span>
                  {isRoundLive && (
                    <span className="tl-feed__live">
                      <i className="tl-pulse" aria-hidden="true" /> Live
                    </span>
                  )}
                </div>

                <div className="tl-rr-grid">
                  {matches.map((match) => (
                    <MatchCard
                      key={match.matchKey}
                      match={match}
                      title={`Cặp ${match.matchIndex + 1}`}
                      myEntryId={myEntryId}
                      entryMap={entryMap}
                      onSpectate={onSpectate}
                      onReplay={onReplay}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
