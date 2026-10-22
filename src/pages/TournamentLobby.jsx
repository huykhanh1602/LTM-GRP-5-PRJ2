import { useEffect, useMemo, useState } from "react";
import TournamentLayout from "../layouts/TournamentLayout.jsx";
import TournamentHeader from "../components/tournament/TournamentHeader.jsx";
import CodeSubmissionPanel from "../components/tournament/CodeSubmissionPanel.jsx";
import BracketView from "../components/tournament/BracketView.jsx";
import RoundRobinSchedule from "../components/tournament/RoundRobinSchedule.jsx";
import RegistrationSlots from "../components/tournament/RegistrationSlots.jsx";
import StandingsTable from "../components/tournament/StandingsTable.jsx";
import MatchFeed from "../components/tournament/MatchFeed.jsx";
import TournamentInfoPanel from "../components/tournament/TournamentInfoPanel.jsx";
import LiveStatus from "../components/tournament/LiveStatus.jsx";
import { useTournamentLive } from "../hooks/useTournamentLive.js";
import {
  TOURNAMENT_PHASES,
  buildRoundRobinFixture,
  getTournamentFixture,
  getEntry as resolveMockEntry,
} from "../mock/tournamentLobby.mock.js";
import {
  FORMAT,
  buildFeedFromRounds,
  computeStandingsFromRounds,
  mergeLiveUpdates,
  normalizeStatus,
  normalizeTournament,
} from "../utils/tournamentView.js";
import "../styles/tournament.css";

// ─────────────────────────────────────────────────────────────
// Modal xem trực tiếp / xem replay một trận trong giải
// ─────────────────────────────────────────────────────────────
function MatchViewerModal({ match, tournament, onClose }) {
  const resolve = (id) =>
    tournament.entryMap?.get?.(String(id ?? "")) ?? resolveMockEntry(id);
  const a = resolve(match.participantAId ?? match.a);
  const b = resolve(match.participantBId ?? match.b);
  const isLive = match.status === "running" || match.status === "live";

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="tl-modal" role="presentation" onClick={onClose}>
      <div
        className="tl-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={isLive ? "Xem trực tiếp" : "Xem replay"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tl-modal__head">
          <span className={`tl-modal__badge ${isLive ? "is-live" : ""}`}>
            {isLive && <i className="tl-pulse" aria-hidden="true" />}
            {isLive ? "Xem trực tiếp" : "Replay trận đấu"}
          </span>
          <h2>{tournament.name}</h2>
          <p>
            {match.matchId ?? match.id ?? match.matchKey}
            {match.replayId ? ` · replay ${match.replayId}` : ""}
          </p>
          <button type="button" className="tl-modal__close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        <div className="tl-modal__scoreboard">
          <div className="tl-modal__team">
            <img src={a?.avatar ?? "/icons.png"} alt="" />
            <strong>{a?.teamName ?? "—"}</strong>
            <small>{a?.owner}</small>
          </div>

          <div className="tl-modal__score">
            <b>{match.score?.a ?? 0}</b>
            <span>:</span>
            <b>{match.score?.b ?? 0}</b>
            <small>{isLive ? "Đang thi đấu · Bo3" : "Kết thúc · Bo3"}</small>
          </div>

          <div className="tl-modal__team">
            <img src={b?.avatar ?? "/icons.png"} alt="" />
            <strong>{b?.teamName ?? "—"}</strong>
            <small>{b?.owner}</small>
          </div>
        </div>

        <div className="tl-modal__stage">
          <div className="tl-modal__stage-item">
            <span>Ván hiện tại</span>
            <b>Ván 3</b>
          </div>
          <div className="tl-modal__stage-item">
            <span>Base còn lại</span>
            <b>{isLive ? "62% · 48%" : "—"}</b>
          </div>
          <div className="tl-modal__stage-item">
            <span>Nước đi</span>
            <b>{isLive ? "27 / 80" : "80 / 80"}</b>
          </div>
          <div className="tl-modal__stage-item">
            <span>Thời gian/nước</span>
            <b>41ms</b>
          </div>
        </div>

        <p className="tl-modal__note">
          {isLive
            ? "Khung xem này là bản mô phỏng giao diện. Trong bản thật, bàn cờ và log nước đi sẽ được stream qua WebSocket."
            : "Replay đầy đủ có thể xem lại trong mục Replay của game với đầy đủ timeline nước đi."}
        </p>

        <div className="tl-modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            {isLive ? "▶ Bật chế độ theo dõi" : "⟲ Mở trình phát replay"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PageTournamentLobby — Phòng chờ Giải đấu
// Nhận `tournamentData` từ Backend, tự đổi UI theo format & status.
// ─────────────────────────────────────────────────────────────
export function PageTournamentLobby({
  tournamentData = null,
  tournamentMeta = null,
  myTeamName = "",
  user = null,
  onBack,
  liveSocket = true,
  socketUrl,
}) {
  const usingMockData = !tournamentData;

  // Chỉ dùng cho chế độ xem trước bằng mock
  const [phaseKey, setPhaseKey] = useState("open");
  const [mockFormat, setMockFormat] = useState(FORMAT.SINGLE_ELIMINATION);

  const [tab, setTab] = useState("standings");
  const [viewer, setViewer] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  // Dữ liệu thật đổi -> bỏ snapshot cũ
  useEffect(() => {
    setSnapshot(null);
  }, [tournamentData]);

  // Giải được chọn ngoài sảnh: đồng bộ trạng thái mock theo status thật
  useEffect(() => {
    if (!tournamentMeta?.status) return;
    const nextPhase = normalizeStatus(tournamentMeta.status);
    if (TOURNAMENT_PHASES.some((phase) => phase.key === nextPhase)) {
      setPhaseKey(nextPhase);
    }
  }, [tournamentMeta?.status]);

  const mockSource = useMemo(() => {
    const base = getTournamentFixture(phaseKey);
    const fixture =
      mockFormat === FORMAT.ROUND_ROBIN ? buildRoundRobinFixture(base) : base;

    if (!tournamentMeta) return fixture;

    const myEntry = myTeamName
      ? {
          id: `me-${user?.id ?? "guest"}`,
          teamName: myTeamName,
          botName: `${myTeamName}.py`,
          owner: user?.display_name ?? myTeamName,
          rating: 1000,
          seed: fixture.entries.length + 1,
          avatar: user?.avatar || "/icons.png",
        }
      : null;
    const entries = myEntry ? [...fixture.entries, myEntry] : fixture.entries;

    return {
      ...fixture,
      ...(tournamentMeta.id ? { id: tournamentMeta.id, code: tournamentMeta.id } : {}),
      ...(tournamentMeta.name ? { name: tournamentMeta.name } : {}),
      ...(tournamentMeta.organizer ? { organizer: tournamentMeta.organizer } : {}),
      ...(tournamentMeta.prize ? { prize: tournamentMeta.prize } : {}),
      ...(tournamentMeta.description ? { description: tournamentMeta.description } : {}),
      ...(tournamentMeta.start_time ? { startAt: tournamentMeta.start_time } : {}),
      entries,
      registered: entries.length,
      ...(myEntry ? { myEntryId: myEntry.id } : {}),
    };
  }, [phaseKey, mockFormat, tournamentMeta, myTeamName, user]);

  const source = snapshot ?? tournamentData ?? mockSource;
  const fallback = usingMockData ? mockSource : {};

  const base = useMemo(
    () => normalizeTournament(source, fallback, { currentUserId: user?.id }),
    [source, fallback, user?.id],
  );

  const isLivePhase = base.status === "in_progress";

  // ── Realtime: chỉ bật khi có dữ liệu thật & giải đang diễn ra ──
  const live = useTournamentLive({
    tournamentId: base.id,
    enabled: Boolean(liveSocket) && isLivePhase && Boolean(tournamentData),
    url: socketUrl,
    onSnapshot: setSnapshot,
  });

  const rounds = useMemo(
    () => mergeLiveUpdates(base.rounds, live.updates) ?? [],
    [base.rounds, live.updates],
  );

  const isRoundRobin = base.format === FORMAT.ROUND_ROBIN;

  const standings = useMemo(() => {
    if (!isRoundRobin) return base.standings;
    if (rounds.length === 0) return base.standings;
    if (live.updates.length === 0 && base.standings.length > 0) return base.standings;
    return computeStandingsFromRounds(rounds, base.entries, {
      championId: base.championId,
      status: base.status,
    });
  }, [isRoundRobin, base.standings, base.entries, base.championId, base.status, rounds, live.updates.length]);

  const feed = useMemo(() => {
    if (live.updates.length === 0) return base.feed;
    return buildFeedFromRounds(rounds, base.roundLabels);
  }, [base.feed, base.roundLabels, rounds, live.updates.length]);

  const tournament = useMemo(
    () => ({
      ...base,
      rounds,
      bracket: rounds.length > 0 ? { ...(base.bracket ?? {}), rounds } : base.bracket,
      standings,
      feed,
    }),
    [base, rounds, standings, feed],
  );

  useEffect(() => {
    setViewer(null);
  }, [tournament.status, tournament.id]);

  const myEntry = base.entryMap.get(tournament.myEntryId);

  const phaseSwitcher = usingMockData ? (
    <div className="tl-mock-controls">
      <div className="tl-phase-switch" role="group" aria-label="Xem trước trạng thái giải đấu">
        <span className="tl-phase-switch__label">Mock state</span>
        {TOURNAMENT_PHASES.map((phase) => (
          <button
            key={phase.key}
            type="button"
            className={phaseKey === phase.key ? "is-active" : ""}
            onClick={() => setPhaseKey(phase.key)}
            title={phase.hint}
          >
            {phase.icon} {phase.label}
          </button>
        ))}
      </div>

      <div className="tl-phase-switch" role="group" aria-label="Xem trước thể thức">
        <span className="tl-phase-switch__label">Format</span>
        <button
          type="button"
          className={mockFormat === FORMAT.SINGLE_ELIMINATION ? "is-active" : ""}
          onClick={() => setMockFormat(FORMAT.SINGLE_ELIMINATION)}
        >
          Single Elim
        </button>
        <button
          type="button"
          className={mockFormat === FORMAT.ROUND_ROBIN ? "is-active" : ""}
          onClick={() => setMockFormat(FORMAT.ROUND_ROBIN)}
        >
          Round Robin
        </button>
      </div>
    </div>
  ) : (
    <LiveStatus connection={live.connection} lastMessageAt={live.lastMessageAt} />
  );

  const showRegistration = tournament.status === "open";

  return (
    <TournamentLayout tournament={tournament} onBack={onBack} actions={phaseSwitcher}>
      <TournamentHeader tournament={tournament} />

      <div className="tl-main">
        <div className="tl-main__primary">
          {isRoundRobin ? (
            <>
              <section className="tl-card" aria-label="Bảng xếp hạng vòng tròn">
                <header className="tl-card__head">
                  <div>
                    <h2 className="tl-card__title">Bảng xếp hạng vòng tròn</h2>
                    <p className="tl-card__desc">
                      {tournament.entries.length} bot · 3 điểm/thắng · 1 điểm/hòa · hiệu số phụ
                      tính theo đối đầu.
                    </p>
                  </div>
                  <LiveStatus
                    connection={live.connection}
                    lastMessageAt={live.lastMessageAt}
                  />
                </header>
                <StandingsTable
                  standings={standings}
                  myEntryId={tournament.myEntryId}
                  championId={tournament.championId}
                  entryMap={tournament.entryMap}
                />
              </section>

              {showRegistration ? (
                <section className="tl-card" aria-label="Danh sách đăng ký">
                  <header className="tl-card__head">
                    <div>
                      <h2 className="tl-card__title">Danh sách đăng ký</h2>
                      <p className="tl-card__desc">
                        Thể thức vòng tròn sẽ tạo lịch đấu ngay khi BTC khóa đăng ký.
                      </p>
                    </div>
                  </header>
                  <RegistrationSlots
                    entries={tournament.entries}
                    capacity={tournament.capacity}
                    myEntryId={tournament.myEntryId}
                    title="Lịch vòng tròn sẽ được tạo sau khi khóa đăng ký"
                  />
                </section>
              ) : tournament.status === "draft" ? (
                <section className="tl-card">
                  <div className="tl-empty">
                    <span className="tl-empty__icon" aria-hidden="true">🗓️</span>
                    <h3>Lịch vòng tròn chưa được tạo</h3>
                    <p>BTC đang chốt danh sách. Lịch đấu xuất hiện khi giải bắt đầu.</p>
                  </div>
                </section>
              ) : (
                <RoundRobinSchedule
                  rounds={rounds}
                  roundLabels={tournament.roundLabels}
                  entryMap={tournament.entryMap}
                  myEntryId={tournament.myEntryId}
                  live={live}
                  onSpectate={setViewer}
                  onReplay={setViewer}
                />
              )}
            </>
          ) : (
            <BracketView
              tournament={tournament}
              rounds={rounds}
              live={live}
              onSpectate={setViewer}
              onReplay={setViewer}
            />
          )}
        </div>

        <aside className="tl-main__side">
          <div className="tl-my-bot">
            <img src={myEntry?.avatar || user?.avatar || "/icons.png"} alt="" />
            <div>
              <small>Bot dự thi của bạn</small>
              <strong>{myEntry?.teamName ?? "Chưa đăng ký"}</strong>
              <span>
                {myEntry
                  ? `${myEntry.botName} · ${myEntry.rating} Elo`
                  : "Nộp bot để tham gia giải đấu"}
              </span>
            </div>
          </div>

          <CodeSubmissionPanel
            key={`${tournament.id}-${tournament.status}-submission`}
            tournament={tournament}
          />

          <TournamentInfoPanel tournament={tournament} />
        </aside>
      </div>

      <section className="tl-card tl-history" aria-label="Bảng xếp hạng và lịch sử trận">
        <header className="tl-card__head tl-history__head">
          {isRoundRobin ? (
            <div>
              <h2 className="tl-card__title">Lịch sử trận</h2>
              <p className="tl-card__desc">
                {tournament.feed.length} trận đã/đang diễn ra trong lịch vòng tròn.
              </p>
            </div>
          ) : (
            <div className="tl-tabs" role="tablist" aria-label="Bảng xếp hạng và lịch sử trận">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "standings"}
                className={`tl-tab ${tab === "standings" ? "is-active" : ""}`}
                onClick={() => setTab("standings")}
              >
                🏅 Bảng xếp hạng
                <span className="tl-tab__count">{standings.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "feed"}
                className={`tl-tab ${tab === "feed" ? "is-active" : ""}`}
                onClick={() => setTab("feed")}
              >
                ⚡ Lịch sử trận
                <span className="tl-tab__count">{feed.length}</span>
              </button>
            </div>
          )}

          <LiveStatus connection={live.connection} lastMessageAt={live.lastMessageAt} />
        </header>

        {isRoundRobin || tab === "feed" ? (
          <MatchFeed
            feed={feed}
            myEntryId={tournament.myEntryId}
            entryMap={tournament.entryMap}
            onReplay={setViewer}
            onSpectate={setViewer}
          />
        ) : (
          <StandingsTable
            standings={standings}
            myEntryId={tournament.myEntryId}
            championId={tournament.championId}
            entryMap={tournament.entryMap}
          />
        )}
      </section>

      {viewer && (
        <MatchViewerModal
          match={viewer}
          tournament={tournament}
          onClose={() => setViewer(null)}
        />
      )}
    </TournamentLayout>
  );
}

export default PageTournamentLobby;
