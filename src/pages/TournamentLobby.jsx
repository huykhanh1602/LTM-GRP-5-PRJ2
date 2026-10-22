import { useCallback, useEffect, useMemo, useState } from "react";
import TournamentLayout from "../layouts/TournamentLayout.jsx";
import TournamentHeader from "../components/tournament/TournamentHeader.jsx";
import BracketView from "../components/tournament/BracketView.jsx";
import RegistrationSlots from "../components/tournament/RegistrationSlots.jsx";
import StandingsTable from "../components/tournament/StandingsTable.jsx";
import MatchFeed from "../components/tournament/MatchFeed.jsx";
import TournamentInfoPanel from "../components/tournament/TournamentInfoPanel.jsx";
import TrophyIcon from "../components/TrophyIcon.jsx";
import {
  attachTournamentSlotResult,
  getMatchReplay,
  getMatches,
  getTournament,
  getTournaments,
  getUserProfile,
  registerTournament,
  startTournament,
} from "../api.js";
import { apiErrorText, formatStartsAt, toTournamentCard, toTournamentView } from "../utils/tournamentApi.js";
import { languageLabels } from "../utils/botLanguages.js";
import "../styles/tournament.css";

const STATUS_BADGE = {
  draft: { className: "upcoming", label: "Bản nháp" },
  open: { className: "upcoming", label: "Sắp diễn ra" },
  in_progress: { className: "ongoing", label: "Đang diễn ra" },
  completed: { className: "completed", label: "Đã kết thúc" },
  cancelled: { className: "completed", label: "Đã hủy" },
};

function Modal({ title, subtitle, onClose, children, footer }) {
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
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tl-modal__head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
          <button type="button" className="tl-modal__close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>
        {children}
        {footer && <div className="tl-modal__actions">{footer}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Trang cá nhân công khai của một người tham gia giải
// ─────────────────────────────────────────────────────────────
function ParticipantProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    getUserProfile(userId)
      .then((data) => active && setProfile(data))
      .catch((err) => active && setError(apiErrorText(err)));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <Modal title="Trang cá nhân" onClose={onClose}>
      {error && <p className="err">{error}</p>}
      {!profile && !error && <p className="muted">Đang tải…</p>}
      {profile && (
        <div className="tl-profile">
          <div className="tl-profile__head">
            <img src={profile.avatar_url || "/icons.png"} alt="" />
            <div>
              <strong>{profile.display_name}</strong>
              <small>Tham gia từ {formatStartsAt(profile.created_at)}</small>
            </div>
          </div>

          <div className="tl-profile__stats">
            <span>
              Trận đã đấu<b>{profile.stats.played}</b>
            </span>
            <span>
              Thắng<b>{profile.stats.wins}</b>
            </span>
            <span>
              Hòa<b>{profile.stats.draws}</b>
            </span>
            <span>
              Thua<b>{profile.stats.losses}</b>
            </span>
          </div>

          <h3>Giải đấu đã tham gia</h3>
          {profile.tournaments.length === 0 ? (
            <p className="muted">Chưa tham gia giải đấu nào.</p>
          ) : (
            <ul className="tl-profile__tours">
              {profile.tournaments.map((row) => (
                <li key={row.id}>
                  <span>{row.name}</span>
                  <small>
                    {STATUS_BADGE[row.status]?.label ?? row.status} · {formatStartsAt(row.starts_at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Chủ giải gắn kết quả của một trận đấu thật vào nhánh
// ─────────────────────────────────────────────────────────────
function AttachResultModal({ slot, nameA, nameB, onClose, onAttached }) {
  const [candidates, setCandidates] = useState(null);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getMatches({ teamId: slot.participantAId, status: "finished", limit: 50 })
      .then(({ items }) => {
        if (!active) return;
        const matched = items.filter((item) =>
          [item.team_a_id, item.team_b_id].includes(slot.participantBId) &&
          [item.team_a_id, item.team_b_id].includes(slot.participantAId),
        );
        setCandidates(matched);
        if (matched.length === 1) setPicked(matched[0].id);
      })
      .catch((err) => active && setError(apiErrorText(err)));
    return () => {
      active = false;
    };
  }, [slot.participantAId, slot.participantBId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onAttached(await slot.attach(picked));
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Gắn kết quả trận đấu"
      subtitle={`${nameA} — ${nameB}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!picked || busy}
            onClick={submit}
          >
            {busy ? "Đang lưu…" : "Xác nhận kết quả"}
          </button>
        </>
      }
    >
      {error && <p className="err">{error}</p>}
      {!candidates && !error && <p className="muted">Đang tìm trận đấu giữa hai đấu thủ…</p>}
      {candidates?.length === 0 && (
        <p className="muted">
          Chưa có trận đấu đã kết thúc nào giữa hai người này. Hãy để họ đấu với nhau trong phòng
          đấu rồi quay lại gắn kết quả.
        </p>
      )}
      {candidates?.length > 0 && (
        <ul className="tl-match-picker">
          {candidates.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="radio"
                  name="slot-match"
                  checked={picked === item.id}
                  onChange={() => setPicked(item.id)}
                />
                <span>
                  <strong>
                    {item.team_a_name} {item.winner_id ? "vs" : "hòa"} {item.team_b_name}
                  </strong>
                  <small>
                    {item.winner_id
                      ? `Thắng: ${item.winner_id === item.team_a_id ? item.team_a_name : item.team_b_name}`
                      : "Hòa"}
                    {item.reason ? ` · ${item.reason}` : ""} · {formatStartsAt(item.ended_at)}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Danh sách giải đấu thật — dùng khi chưa chọn giải nào
// ─────────────────────────────────────────────────────────────
function TournamentPicker({ gameId, onPick, onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    getTournaments({ limit: 100 })
      .then((data) => active && setItems(data.items.map(toTournamentCard)))
      .catch((err) => active && setError(apiErrorText(err)));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (items ?? []).filter((item) => !gameId || item.gameId === gameId),
    [items, gameId],
  );

  return (
    <div className="tl-page">
      <div className="tl-toolbar">
        {onBack && (
          <button type="button" className="btn small tl-toolbar__back" onClick={onBack}>
            ← Quay lại
          </button>
        )}
        <nav className="tl-breadcrumb" aria-label="Đường dẫn">
          <span>Trang chủ</span>
          <i aria-hidden="true">/</i>
          <strong>Giải đấu</strong>
        </nav>
      </div>

      <div className="tl-shell">
        <section className="tl-card">
          <header className="tl-card__head">
            <div>
              <h2 className="tl-card__title">Chọn giải đấu</h2>
              <p className="tl-card__desc">Mỗi giải đấu có một phòng chờ riêng.</p>
            </div>
          </header>

          {error && <p className="err">{error}</p>}
          {!items && !error && <p className="muted">Đang tải danh sách giải đấu…</p>}
          {visible?.length === 0 && (
            <div className="tl-empty">
              <span className="tl-empty__icon"><TrophyIcon size="56px" /></span>
              <h3>Chưa có giải đấu nào</h3>
              <p>Vào Trang cá nhân để mở giải đấu mới.</p>
            </div>
          )}

          <div className="tour-list-container">
            {visible?.map((item) => (
              <button key={item.id} type="button" className="tour-card-item" onClick={() => onPick(item.id)}>
                <div className="tour-card-top">
                  <div>
                    <span className="tour-card-code">{item.code}</span>
                    <h4 className="tour-card-title">{item.name}</h4>
                  </div>
                  <span className={`tour-status-badge ${STATUS_BADGE[item.status]?.className ?? ""}`}>
                    {STATUS_BADGE[item.status]?.label ?? item.status}
                  </span>
                </div>
                <div className="tour-card-meta">
                  <span>🎮 {item.gameName}</span>
                  <span>👑 {item.organizerName}</span>
                  <span>
                    👥 {item.registered}
                    {item.capacity ? `/${item.capacity}` : ""} người
                  </span>
                  <span>⏰ {formatStartsAt(item.startsAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PageTournamentLobby — phòng chờ riêng của MỘT giải đấu.
// Toàn bộ dữ liệu lấy từ API theo tournamentId.
// ─────────────────────────────────────────────────────────────
export function PageTournamentLobby({
  tournamentId = null,
  gameId = null,
  user = null,
  token = null,
  onBack,
  onOpenReplay,
  onRequireLogin,
}) {
  const [pickedId, setPickedId] = useState(null);
  const activeId = tournamentId ?? pickedId;

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("standings");
  const [profileId, setProfileId] = useState(null);
  const [attachSlot, setAttachSlot] = useState(null);

  const load = useCallback(async () => {
    const data = await getTournament(activeId);
    setRaw(data);
    return data;
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setRaw(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .catch((err) => active && setError(apiErrorText(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [activeId, load]);

  const tournament = useMemo(
    () => (raw ? toTournamentView(raw, user?.id) : null),
    [raw, user?.id],
  );

  async function run(action, successText) {
    if (!token) {
      onRequireLogin?.();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setRaw(await action());
      setMessage({ tone: "ok", text: successText });
    } catch (err) {
      setMessage({ tone: "err", text: apiErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function openReplay(matchId) {
    if (!matchId) return;
    setMessage(null);
    try {
      onOpenReplay?.(await getMatchReplay(matchId));
    } catch (err) {
      setMessage({ tone: "err", text: apiErrorText(err) });
    }
  }

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
  const hasBracket = tournament.rounds.length > 0;
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
                  <h2 className="tl-card__title">Người tham gia</h2>
                  <p className="tl-card__desc">
                    {tournament.registered}
                    {tournament.capacity ? `/${tournament.capacity}` : ""} người đã đăng ký · bấm vào
                    một người để xem trang cá nhân.
                  </p>
                </div>
              </header>

              <RegistrationSlots
                entries={tournament.entries}
                capacity={tournament.capacity}
                myEntryId={tournament.myEntryId}
                onOpenProfile={setProfileId}
                title="Sơ đồ nhánh sẽ được xếp khi chủ giải khởi tranh"
              />

              <div className="tl-actions">
                {registrationOpen && !isRegistered && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() =>
                      run(() => registerTournament(tournament.id, token), "🎉 Bạn đã đăng ký tham gia giải đấu.")
                    }
                  >
                    📝 Đăng ký tham gia
                  </button>
                )}
                {registrationOpen && isRegistered && (
                  <span className="tl-pill">✔ Bạn đã có trong danh sách thi đấu</span>
                )}
                {registrationOpen && isOrganizer && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || tournament.registered < 2}
                    title={tournament.registered < 2 ? "Cần ít nhất 2 người đăng ký" : undefined}
                    onClick={() =>
                      run(() => startTournament(tournament.id, token), "Giải đấu đã khởi tranh, sơ đồ nhánh đã được xếp.")
                    }
                  >
                    ⚔️ Khởi tranh & xếp nhánh
                  </button>
                )}
                {status === "draft" && (
                  <span className="tl-pill">Giải chưa mở đăng ký</span>
                )}
              </div>
            </section>
          ) : (
            <BracketView
              tournament={tournament}
              rounds={tournament.rounds}
              onReplay={(slot) => openReplay(slot.matchId ?? slot.replayId)}
              onOpenProfile={setProfileId}
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
    </TournamentLayout>
  );
}

export default PageTournamentLobby;
