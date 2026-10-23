import MatchCard from "./MatchCard.jsx";
import StandingsTable from "./StandingsTable.jsx";
import { getRoundLabels } from "../../utils/tournamentView.js";
import TrophyIcon from "../TrophyIcon.jsx";

// ─────────────────────────────────────────────────────────────
// Bảng đấu Vòng tròn (Round-Robin Schedule + Standings)
// Hiển thị danh sách các vòng, từng cặp đấu và bảng xếp hạng
// điểm số (Thắng/Hòa/Thua, Điểm, Hiệu số) cập nhật động.
// ─────────────────────────────────────────────────────────────
export default function RoundRobinView({
  tournament,
  rounds = null,
  roundLabels = null,
  onSpectate,
  onReplay,
  onOpenProfile,
}) {
  const bracketRounds =
    rounds ?? tournament.rounds ?? tournament.bracket?.rounds ?? [];
  const labels =
    roundLabels ??
    tournament.roundLabels ??
    getRoundLabels(bracketRounds.length, tournament.format);

  const totalRounds = bracketRounds.length;
  const totalMatches = bracketRounds.reduce((sum, matches) => sum + matches.length, 0);
  const champion = tournament.championId
    ? tournament.entryMap?.get?.(tournament.championId) ?? null
    : null;

  const showOpenSlots = tournament.status === "open";
  const showDraftEmpty = tournament.status === "draft";
  const showMissingBracket =
    !showOpenSlots && !showDraftEmpty && totalRounds === 0;

  return (
    <section className="tl-card tl-bracket-card" aria-label="Bảng đấu vòng tròn">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">Bảng đấu vòng tròn</h2>
          <p className="tl-card__desc">
            Round Robin
            {totalRounds > 0 && ` · ${totalRounds} vòng · ${totalMatches} trận`}
            · mỗi người gặp tất cả những người còn lại.
          </p>
        </div>
        <div className="tl-card__aside">
          <span className="tl-bracket__legend">
            <i className="tl-legend-dot tl-legend-dot--ready" /> Sẵn sàng
            <i className="tl-legend-dot tl-legend-dot--done" /> Kết thúc
          </span>
        </div>
      </header>

      {showDraftEmpty && (
        <div className="tl-empty">
          <span className="tl-empty__icon" aria-hidden="true">🗺️</span>
          <h3>Sơ đồ vòng tròn chưa được tạo</h3>
          <p>
            BTC đang chốt danh sách và thể lệ. Bảng đấu sẽ xuất hiện ngay khi giải chuyển sang
            trạng thái <b>Đang diễn ra</b>.
          </p>
        </div>
      )}

      {champion && (
        <div className="tl-champion">
          <span className="tl-champion__crown" aria-hidden="true">👑</span>
          <img className="tl-champion__avatar" src={champion.avatar} alt="" />
          <div className="tl-champion__text">
            <small>Quán quân giải đấu</small>
            <strong>{champion.teamName}</strong>
            <span>
              {champion.owner} · {champion.botName}
            </span>
          </div>
          <span className="tl-champion__prize"><TrophyIcon size="22px" /> {tournament.prize}</span>
        </div>
      )}

      {showMissingBracket && (
        <div className="tl-empty">
          <span className="tl-empty__icon" aria-hidden="true">📭</span>
          <h3>Chưa có dữ liệu bảng đấu</h3>
          <p>API chưa trả về <code>bracket.rounds</code> cho giải đấu này.</p>
        </div>
      )}

      {totalRounds > 0 && (
        <div className="tl-rr-schedule">
          {/* Danh sách các vòng đấu */}
          <div className="tl-rr-rounds">
            {bracketRounds.map((matches, roundIndex) => (
              <details
                key={`round-${roundIndex}`}
                className="tl-rr-round"
                open={roundIndex < 2}
              >
                <summary className="tl-rr-round__head">
                  <span className="tl-rr-round__label">
                    {labels[roundIndex] ?? `Vòng ${roundIndex + 1}`}
                  </span>
                  <span className="tl-rr-round__count">
                    {matches.filter((m) => m.status === "done").length}/{matches.length} trận
                  </span>
                  <span className="tl-rr-round__toggle" aria-hidden="true">▾</span>
                </summary>
                <div className="tl-rr-round__matches">
                  {matches.map((match) => (
                    <div
                      key={match.matchKey}
                      className="tl-rr-match"
                    >
                      <MatchCard
                        match={match}
                        title={`Trận ${match.matchIndex + 1}`}
                        isFinal={false}
                        isThirdPlace={false}
                        myEntryId={tournament.myEntryId}
                        entryMap={tournament.entryMap}
                        onSpectate={onSpectate}
                        onReplay={onReplay}
                      />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          {/* Bảng xếp hạng điểm số */}
          <div className="tl-rr-standings">
            <h3 className="tl-rr-standings__title">📊 Bảng xếp hạng</h3>
            <StandingsTable
              standings={tournament.standings}
              myEntryId={tournament.myEntryId}
              championId={tournament.championId}
              entryMap={tournament.entryMap}
            />
          </div>
        </div>
      )}
    </section>
  );
}