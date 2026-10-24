import { useEffect } from "react";
import TournamentLayout from "../layouts/TournamentLayout.jsx";
import { useState } from "react";
import TournamentHeader from "../components/tournament/TournamentHeader.jsx";
import BracketView from "../components/tournament/BracketView.jsx";
import RoundRobinView from "../components/tournament/RoundRobinView.jsx";
import RegistrationSlots from "../components/tournament/RegistrationSlots.jsx";
import StandingsTable from "../components/tournament/StandingsTable.jsx";
import MatchFeed from "../components/tournament/MatchFeed.jsx";
import TournamentInfoPanel from "../components/tournament/TournamentInfoPanel.jsx";
import ParticipantProfileModal from "../components/tournament/ParticipantProfileModal.jsx";
import AttachResultModal from "../components/tournament/AttachResultModal.jsx";
import TeamRegistrationModal from "../components/tournament/TeamRegistrationModal.jsx";
import TeamManagementPanel from "../components/tournament/TeamManagementPanel.jsx";
import AdminControlModal from "../components/tournament/AdminControlModal.jsx";
import EditRegistrationWindowModal from "../components/profile/EditRegistrationWindowModal.jsx";
import TournamentPicker from "../components/tournament/TournamentPicker.jsx";
import { TopMatchBanner } from "../components/tournament/TopMatchBanner.jsx";
import { useTopMatch } from "../hooks/useTopMatch.js";
import { attachTournamentSlotResult, registerTournament } from "../api.js";
import { apiErrorText, formatStartsAt, participantUnit } from "../utils/tournamentApi.js";
import { useTournamentLobby } from "../hooks/useTournamentLobby.js";
import "../styles/tournament.css";

// ─────────────────────────────────────────────────────────────
// PageTournamentLobby — phòng chờ riêng của MỘT giải đấu.
// Toàn bộ dữ liệu lấy từ API theo tournamentId.
// ─────────────────────────────────────────────────────────────
export function PageTournamentLobby({
  tournamentId = null,
  roundNo = null,
  gameId = null,
  user = null,
  token = null,
  onBack,
  onOpenReplay,
  onRequireLogin,
  onEnterRoom = null,
}) {
  const {
    setPickedId,
    activeId,
    setRaw,
    loading,
    error,
    message,
    setMessage,
    busy,
    tab,
    setTab,
    profileId,
    setProfileId,
    attachSlot,
    setAttachSlot,
    teamModal,
    setTeamModal,
    adminModal,
    setAdminModal,
    tournament,
    load,
    run,
    openReplay,
  } = useTournamentLobby({ tournamentId, user, token, onOpenReplay, onRequireLogin });
  useEffect(() => {
    if (!roundNo || !tournament || String(tournament.id) !== String(activeId)) return;
    setTab("feed");
    requestAnimationFrame(() => document.querySelector(".tl-history")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [roundNo, tournament?.id, activeId, setTab]);
  const top = useTopMatch({
    tournamentId: activeId,
    token,
    enabled: Boolean(user?.id) && tournament?.status === "in_progress",
    onResolved: () => load().catch(() => {}),
  });
  const [windowModal, setWindowModal] = useState(false);

  if (!activeId) {
    return <TournamentPicker gameId={gameId} onPick={setPickedId} onBack={onBack} />;
  }

  if (loading && !tournament) {
    return (
      <div className="tl-page">
        <div className="tl-shell">
          <section className="tl-card">
            <p className="muted">Đang tải phòng chờ giải đấu…</p>
          </section>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="tl-page">
        <div className="tl-toolbar">
          {onBack && (
            <button type="button" className="btn small tl-toolbar__back" onClick={onBack}>
              ← Quay lại
            </button>
          )}
        </div>
        <div className="tl-shell">
          <section className="tl-card">
            <div className="tl-empty">
              <span className="tl-empty__icon" aria-hidden="true">⚠️</span>
              <h3>Không mở được phòng chờ</h3>
              <p>{error ?? "Không có dữ liệu giải đấu."}</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const { status, isOrganizer, isRegistered } = tournament;
  const registrationOpen = status === "open";
  // Khung mở/đóng đơn đăng ký.
  const now = Date.now();
  const opensAt = tournament.registrationOpensAt ? new Date(tournament.registrationOpensAt).getTime() : null;
  const closesAt = tournament.registrationClosesAt ? new Date(tournament.registrationClosesAt).getTime() : null;
  const beforeOpen = opensAt !== null && now < opensAt;
  const afterClose = closesAt !== null && now > closesAt;
  const canRegister = registrationOpen && !beforeOpen && !afterClose;
  const hasBracket = tournament.rounds.length > 0;
  const unit = participantUnit(tournament.participantMode);
  const waitingSlots = tournament.rounds
    .flat()
    .filter((slot) => slot.status === "ready" && !slot.winnerId && !slot.matchId);

  const entryName = (id) => tournament.entryMap.get(String(id ?? ""))?.teamName ?? "—";

  return (
    <TournamentLayout
      tournament={tournament}
      onBack={onBack}
      actions={
        <button
          type="button"
          className="btn small"
          onClick={() => load().catch((err) => setMessage({ tone: "err", text: apiErrorText(err) }))}
          disabled={loading}
        >
          ⟳ Làm mới
        </button>
      }
    >
      <TournamentHeader tournament={tournament} />

      {message && (
        <p className={`tl-banner tl-banner--${message.tone}`} role="status">
          {message.text}
        </p>
      )}

      {top.error && (
        <p className="tl-banner tl-banner--err" role="status">
          {top.error}
        </p>
      )}

      <TopMatchBanner
        match={top.match}
        deadline={top.deadline}
        busy={top.busy}
        onEnterRoom={() =>
          onEnterRoom?.({
            tournamentId: top.match.tournamentId,
            roundNo: top.match.roundNo,
            slotIndex: top.match.slotIndex,
            gameId: tournament.gameId ?? tournament.raw?.game_id ?? "rps_chess",
          })
        }
        onWatchRoom={
          top.match?.found
            ? () =>
                onEnterRoom?.({
                  tournamentId: top.match.tournamentId,
                  roundNo: top.match.roundNo,
                  slotIndex: top.match.slotIndex,
                  gameId: tournament.gameId ?? tournament.raw?.game_id ?? "rps_chess",
                  spectator: true,
                })
            : null
        }
        onOpenReplay={(matchId) => openReplay(matchId)}
      />

      <div className="tl-main">
        <div className="tl-main__primary">
          {status === "in_progress" && (
            <p className="tl-banner tl-banner--warn">
              🔒 Giải đang diễn ra — đã khóa đăng ký, bạn chỉ có thể vào xem.
            </p>
          )}

          {registrationOpen || status === "draft" ? (
            <section className="tl-card" aria-label="Người tham gia giải đấu">
              <header className="tl-card__head">
                <div>
                  <h2 className="tl-card__title">{unit === "đội" ? "Đội tham gia" : "Người tham gia"}</h2>
                  <p className="tl-card__desc">
                    {tournament.registered}
                    {tournament.capacity ? `/${tournament.capacity}` : ""} {unit} đã đăng ký · bấm vào
                    một {unit} để xem trang cá nhân.
                  </p>
                </div>
              </header>

              <RegistrationSlots
                entries={tournament.entries}
                capacity={tournament.capacity}
                unit={unit}
                myEntryId={tournament.myEntryId}
                onOpenProfile={setProfileId}
                title="Sơ đồ nhánh sẽ được xếp khi chủ giải khởi tranh"
              />

              <div className="tl-actions">
                {registrationOpen && beforeOpen && (
                  <span className="tl-pill">⏳ Chưa tới ngày mở đơn · {formatStartsAt(tournament.registrationOpensAt)}</span>
                )}
                {registrationOpen && afterClose && (
                  <span className="tl-pill">🔒 Đã đóng đơn · chờ chủ giải khởi tranh</span>
                )}
                {canRegister && !isRegistered && tournament.participantMode === "TEAM" && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => setTeamModal(true)}
                  >
                    👥 Đăng ký Đội (Tạo / Chọn)
                  </button>
                )}
                {canRegister && !isRegistered && tournament.participantMode !== "TEAM" && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await registerTournament(tournament.id, token);
                        return load();
                      }, "🎉 Bạn đã đăng ký tham gia giải đấu.")
                    }
                  >
                    📝 Đăng ký tham gia
                  </button>
                )}
                {registrationOpen && isRegistered && (
                  <span className="tl-pill">✔ Bạn đã có trong danh sách thi đấu</span>
                )}
                {isOrganizer && status === "open" && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    title="Đổi ngày mở đơn và đóng đơn của giải"
                    onClick={() => setWindowModal(true)}
                  >
                    📅 Sửa mở/đóng đơn
                  </button>
                )}
                {isOrganizer && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setAdminModal(true)}
                  >
                    🛠 Bảng điều khiển giải
                  </button>
                )}
                {status === "draft" && (
                  <span className="tl-pill">Giải chưa mở đăng ký</span>
                )}
              </div>
            </section>
          ) : tournament.format === "round_robin" ? (
            <RoundRobinView
              tournament={tournament}
              rounds={tournament.rounds}
              onReplay={(slot) => openReplay(slot.matchId ?? slot.replayId)}
              onOpenProfile={setProfileId}
            />
          ) : (
            <BracketView
              tournament={tournament}
              rounds={tournament.rounds}
              onReplay={(slot) => openReplay(slot.matchId ?? slot.replayId)}
              onOpenProfile={setProfileId}
            />
          )}

          {isRegistered && tournament.participantMode === "TEAM"
            && status !== "completed" && status !== "cancelled" && (
            <TeamManagementPanel
              tournament={tournament}
              user={user}
              token={token}
              onUpdated={() => { load().then(setRaw).catch(() => {}); }}
            />
          )}

          {isOrganizer && status === "in_progress" && (
            <section className="tl-card" aria-label="Trận chờ kết quả">
              <header className="tl-card__head">
                <div>
                  <h2 className="tl-card__title">Trận chờ kết quả</h2>
                  <p className="tl-card__desc">
                    Gắn kết quả của một trận đấu thật vào nhánh để người thắng đi tiếp.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() => setAdminModal(true)}
                >
                  🛠 Bảng điều khiển giải
                </button>
              </header>

              {waitingSlots.length === 0 ? (
                <p className="muted">Không còn nhánh nào đang chờ kết quả.</p>
              ) : (
                <ul className="tl-pending">
                  {waitingSlots.map((slot) => (
                    <li key={slot.matchKey}>
                      <span>
                        {tournament.roundLabels[slot.roundIndex] ?? `Vòng ${slot.roundNo}`} ·{" "}
                        <strong>{entryName(slot.participantAId)}</strong> vs{" "}
                        <strong>{entryName(slot.participantBId)}</strong>
                      </span>
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={busy}
                        onClick={() => setAttachSlot(slot)}
                      >
                        Gắn kết quả
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="tl-main__side">
          <div className="tl-my-bot">
            <img src={user?.avatar || "/icons.png"} alt="" />
            <div>
              <small>
                {isOrganizer ? "Bạn là người tổ chức" : "Tham gia của bạn"}
              </small>
              <strong>
                {isOrganizer
                  ? tournament.organizer.name
                  : isRegistered
                    ? (tournament.entryMap.get(tournament.myEntryId)?.teamName ?? user?.display_name)
                    : user
                      ? "Chưa đăng ký"
                      : "Khách"}
              </strong>
              <span>
                {registrationOpen
                  ? isRegistered
                    ? "Bạn đã có suất thi đấu"
                    : "Đăng ký để giành suất thi đấu"
                  : status === "in_progress"
                    ? "Đã khóa đăng ký"
                    : "Giải đã kết thúc"}
              </span>
            </div>
          </div>

          <TournamentInfoPanel tournament={tournament} />
        </aside>
      </div>

      {hasBracket && (
        <section className="tl-card tl-history" aria-label="Bảng xếp hạng và lịch sử trận">
          <header className="tl-card__head tl-history__head">
            <div className="tl-tabs" role="tablist" aria-label="Bảng xếp hạng và lịch sử trận">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "standings"}
                className={`tl-tab ${tab === "standings" ? "is-active" : ""}`}
                onClick={() => setTab("standings")}
              >
                🏅 Bảng xếp hạng
                <span className="tl-tab__count">{tournament.standings.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "feed"}
                className={`tl-tab ${tab === "feed" ? "is-active" : ""}`}
                onClick={() => setTab("feed")}
              >
                ⚡ Lịch sử trận
                <span className="tl-tab__count">{tournament.feed.length}</span>
              </button>
            </div>
          </header>

          {tab === "feed" ? (
            <MatchFeed
              feed={tournament.feed}
              roundNo={roundNo}
              myEntryId={tournament.myEntryId}
              entryMap={tournament.entryMap}
              onReplay={(row) => openReplay(row.matchId ?? row.replayId)}
            />
          ) : (
            <StandingsTable
              standings={tournament.standings}
              myEntryId={tournament.myEntryId}
              championId={tournament.championId}
              entryMap={tournament.entryMap}
            />
          )}
        </section>
      )}

      {profileId && (
        <ParticipantProfileModal userId={profileId} onClose={() => setProfileId(null)} />
      )}

      {attachSlot && (
        <AttachResultModal
          slot={{
            ...attachSlot,
            attach: (matchId) =>
              attachTournamentSlotResult(
                tournament.id,
                attachSlot.roundNo,
                attachSlot.matchIndex,
                matchId,
                token,
              ),
          }}
          nameA={entryName(attachSlot.participantAId)}
          nameB={entryName(attachSlot.participantBId)}
          onClose={() => setAttachSlot(null)}
          onAttached={(data) => {
            setRaw(data);
            setAttachSlot(null);
            setMessage({ tone: "ok", text: "Đã ghi nhận kết quả trận đấu." });
          }}
        />
      )}

      {teamModal && (
        <TeamRegistrationModal
          tournament={tournament}
          user={user}
          token={token}
          onClose={() => setTeamModal(false)}
          onRegistered={(data) => {
            setRaw(data);
            setTeamModal(false);
            setMessage({ tone: "ok", text: "🎉 Đội đã đăng ký tham gia giải đấu." });
          }}
        />
      )}

      {adminModal && (
        <AdminControlModal
          tournament={tournament}
          token={token}
          onClose={() => setAdminModal(false)}
          onUpdated={() => {
            load().catch(() => {});
            setMessage({ tone: "ok", text: "Bảng điều điều giải đã cập nhật." });
          }}
        />
      )}

      {windowModal && (
        <EditRegistrationWindowModal
          tournament={tournament}
          token={token}
          onClose={() => setWindowModal(false)}
          onSaved={(data) => {
            setRaw(data);
            setWindowModal(false);
            setMessage({ tone: "ok", text: "📅 Đã cập nhật khung mở/đóng đơn của giải." });
          }}
        />
      )}
    </TournamentLayout>
  );
}

export default PageTournamentLobby;
