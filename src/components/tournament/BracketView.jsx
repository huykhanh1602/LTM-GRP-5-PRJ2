import { Fragment } from "react";
import MatchCard from "./MatchCard.jsx";
import RegistrationSlots from "./RegistrationSlots.jsx";
import LiveStatus from "./LiveStatus.jsx";
import { getRoundLabels } from "../../utils/tournamentView.js";

// ─────────────────────────────────────────────────────────────
// Bảng nhánh đấu (Single Elimination) — render động theo
// tournamentData.bracket.rounds (không hardcode số đội/số vòng)
// ─────────────────────────────────────────────────────────────
export default function BracketView({
  tournament,
  rounds = null,
  roundLabels = null,
  live = null,
  onSpectate,
  onReplay,
}) {
  const bracketRounds =
    rounds ?? tournament.rounds ?? tournament.bracket?.rounds ?? [];
  const labels =
    roundLabels ??
    tournament.roundLabels ??
    getRoundLabels(bracketRounds.length, tournament.format);

  const totalRounds = bracketRounds.length;
  const totalMatches = bracketRounds.reduce((sum, matches) => sum + matches.length, 0);
  const firstRoundCount = bracketRounds[0]?.length ?? 1;

  // Số hàng = 2^số vòng (bracket chuẩn), luôn đủ chỗ cho vòng đầu
  const totalRows = Math.max(2, 2 ** totalRounds, firstRoundCount * 2);

  const champion = tournament.championId
    ? tournament.entryMap?.get?.(tournament.championId) ?? null
    : null;

  const showOpenSlots = tournament.status === "open";
  const showDraftEmpty = tournament.status === "draft";
  const showMissingBracket =
    !showOpenSlots && !showDraftEmpty && totalRounds === 0;

  return (
    <section className="tl-card tl-bracket-card" aria-label="Bảng nhánh đấu">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">Bảng nhánh đấu</h2>
          <p className="tl-card__desc">
            {tournament.formatLabel}
            {totalRounds > 0 && ` · ${totalRounds} vòng · ${totalMatches} trận`} · thắng đi tiếp,
            thua dừng bước.
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

      {showDraftEmpty && (
        <div className="tl-empty">
          <span className="tl-empty__icon" aria-hidden="true">🗺️</span>
          <h3>Sơ đồ nhánh chưa được tạo</h3>
          <p>
            BTC đang chốt danh sách và thể lệ. Bảng nhánh sẽ xuất hiện ngay khi giải chuyển sang
            trạng thái <b>Đang diễn ra</b>.
          </p>
        </div>
      )}

      {showOpenSlots && (
        <RegistrationSlots
          entries={tournament.entries ?? []}
          capacity={tournament.capacity}
          myEntryId={tournament.myEntryId}
        />
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
          <span className="tl-champion__prize">🏆 {tournament.prize}</span>
        </div>
      )}

      {showMissingBracket && (
        <div className="tl-empty">
          <span className="tl-empty__icon" aria-hidden="true">📭</span>
          <h3>Chưa có dữ liệu bảng nhánh</h3>
          <p>API chưa trả về <code>bracket.rounds</code> cho giải đấu này.</p>
        </div>
      )}

      {totalRounds > 0 && (
        <div className="tl-bracket-scroll">
          <div className="tl-bracket">
            <div className="tl-bracket__labels" style={{ "--tl-rounds": totalRounds }}>
              {bracketRounds.map((matches, index) => {
                const isFinal = index === totalRounds - 1;
                return (
                  <div
                    key={`label-${index}`}
                    className={`tl-bracket__label ${isFinal ? "is-final" : ""}`}
                  >
                    <span>{labels[index] ?? `Vòng ${index + 1}`}</span>
                    <small>{matches.length} trận</small>
                  </div>
                );
              })}
            </div>

            <div
              className="tl-bracket__tree"
              style={{ "--tl-rounds": totalRounds, "--tl-rows": totalRows }}
            >
              {bracketRounds.map((matches, roundIndex) => {
                // Mỗi slot chiếm đúng phần chiều cao của vòng đó:
                // vòng 0 (4 trận / 8 hàng) = 2 hàng, bán kết = 4, chung kết = 8
                const span = Math.max(
                  1,
                  Math.floor(totalRows / Math.max(1, matches.length)),
                );
                const isFinalRound = roundIndex === totalRounds - 1;

                return (
                  <Fragment key={`round-${roundIndex}`}>
                    {matches.map((match) => (
                      <div
                        key={match.matchKey}
                        className={`tl-slot ${roundIndex > 0 ? "tl-slot--joiner" : "tl-slot--feeder"} ${
                          isFinalRound ? "tl-slot--final" : ""
                        }`}
                        style={{
                          gridColumn: roundIndex + 1,
                          gridRow: `${match.matchIndex * span + 1} / span ${span}`,
                        }}
                      >
                        <MatchCard
                          match={match}
                          title={
                            isFinalRound && matches.length === 1
                              ? "🏆 Chung kết"
                              : `Trận ${match.matchIndex + 1}`
                          }
                          isFinal={isFinalRound}
                          myEntryId={tournament.myEntryId}
                          entryMap={tournament.entryMap}
                          onSpectate={onSpectate}
                          onReplay={onReplay}
                        />
                      </div>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
