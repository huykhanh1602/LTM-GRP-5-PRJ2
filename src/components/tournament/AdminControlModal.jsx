import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { rescheduleMatch, triggerRoundStart, updateRoundSchedule } from "../../api.js";
import { apiErrorText } from "../../utils/tournamentApi.js";

// Chuyển ISO sang giá trị cho input datetime-local (giờ địa phương)
function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// ─────────────────────────────────────────────────────────────
// Bảng điều điều giải (Admin): điều thời gian vòng/trận,
// Bắt đầu ngay (Trigger Start), hoãn/dời lịch trận đấu.
// ─────────────────────────────────────────────────────────────

// Vòng mặc định theo "trận tiếp theo": trận đã có mã và chưa có kết quả,
// rồi tới suất chờ kết quả, cuối cùng là vòng gần nhất.
function defaultRoundId(rounds) {
  const playable = (round) => (round.matches ?? []).filter((item) => item.match_id);
  const hasLive = (round) => playable(round).some((m) => !m.winner_id);
  const hasPending = (round) => (round.matches ?? []).some((m) => !m.winner_id);
  return (
    rounds.find((round) => hasLive(round)) ??
    rounds.find((round) => hasPending(round)) ??
    rounds.at(-1)
  )?.id ?? null;
}

export default function AdminControlModal({ tournament, token, onClose, onUpdated }) {
  const rawRounds = tournament.raw?.rounds ?? [];
  const [roundId, setRoundId] = useState(() => defaultRoundId(rawRounds));
  const [roundAt, setRoundAt] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [matchId, setMatchId] = useState(null);
  const [matchAt, setMatchAt] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeRound = rawRounds.find((round) => round.id === roundId) ?? null;
  // Ưu tiên trận chưa có kết quả để mặc định chọn "trận tiếp theo".
  const matchOptions = [...(activeRound?.matches ?? [])]
    .filter((item) => item.match_id)
    .sort((a, b) => Number(Boolean(a.winner_id)) - Number(Boolean(b.winner_id)));

  useEffect(() => {
    setRoundAt(toLocalInputValue(activeRound?.scheduled_at));
    setAutoStart(Boolean(activeRound?.auto_start ?? true));
    setMatchId(matchOptions[0]?.match_id ?? null);
    setMatchAt(toLocalInputValue(matchOptions[0]?.played_at ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function run(action, successText) {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await action());
      setError({ tone: "ok", text: successText });
    } catch (err) {
      setError({ tone: "err", text: apiErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Bảng điều điều giải"
      subtitle="Điều thời gian thi đấu, khởi tranh thủ và hoãn trận đấu"
      onClose={onClose}
    >
      {error && (
        <p className={`tl-banner tl-banner--${error.tone}`} role="status">
          {error.text}
        </p>
      )}

      <h3 className="tl-admin-title">⏰ Vòng đấu</h3>
      <label className="tl-form-label" htmlFor="tl-admin-round">
        Chọn vòng
      </label>
      <select
        id="tl-admin-round"
        className="tl-form-input"
        value={roundId ?? ""}
        onChange={(event) => setRoundId(event.target.value)}
      >
        {rawRounds.map((round) => (
          <option key={round.id} value={round.id}>
            Vòng {round.round_no} · {round.status}
          </option>
        ))}
      </select>

      <label className="tl-form-label" htmlFor="tl-admin-round-at">
        Thời gian thi đấu (scheduled_at)
      </label>
      <input
        id="tl-admin-round-at"
        type="datetime-local"
        className="tl-form-input"
        value={roundAt}
        onChange={(event) => setRoundAt(event.target.value)}
      />

      <label className="tl-form-label">
        <input
          type="checkbox"
          checked={autoStart}
          onChange={(event) => setAutoStart(event.target.checked)}
        />
        Khởi tranh tự động khi đến thời gian
      </label>

      <div className="tl-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || !roundId}
          onClick={() =>
            run(
              () =>
                updateRoundSchedule(
                  tournament.id,
                  roundId,
                  roundAt ? new Date(roundAt).toISOString() : null,
                  autoStart,
                  token,
                ),
              "Lịch vòng đã cập nhật.",
            )
          }
        >
          💾 Lưu lịch vòng
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !roundId}
          onClick={() =>
            run(() => triggerRoundStart(tournament.id, roundId, token), "Vòng đã khởi tranh ngay.")
          }
        >
          ▶ Bắt đầu ngay
        </button>
      </div>

      {matchOptions.length > 0 && (
        <>
          <h3 className="tl-admin-title">🔁 Hoãn / dời lịch trận đấu</h3>
          <label className="tl-form-label" htmlFor="tl-admin-match">
            Trận đấu (có mã trận)
          </label>
          <select
            id="tl-admin-match"
            className="tl-form-input"
            value={matchId ?? ""}
            onChange={(event) => {
              const picked = matchOptions.find((item) => item.match_id === event.target.value);
              setMatchId(event.target.value);
              setMatchAt(toLocalInputValue(picked?.played_at ?? null));
            }}
          >
            {matchOptions.map((item) => (
              <option key={item.match_id} value={item.match_id}>
                {item.participant_a_name} vs {item.participant_b_name}
              </option>
            ))}
          </select>

          <label className="tl-form-label" htmlFor="tl-admin-match-at">
            Thời gian mới
          </label>
          <input
            id="tl-admin-match-at"
            type="datetime-local"
            className="tl-form-input"
            value={matchAt}
            onChange={(event) => setMatchAt(event.target.value)}
          />

          <div className="tl-actions">
            <button
              type="button"
              className="btn"
              disabled={busy || !matchId}
              onClick={() =>
                run(
                  () =>
                    rescheduleMatch(
                      matchId,
                      matchAt ? new Date(matchAt).toISOString() : null,
                      token,
                    ),
                  "Trận đấu đã hoãn/dời lịch.",
                )
              }
            >
              🔁 Hoãn / dời lịch trận
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}