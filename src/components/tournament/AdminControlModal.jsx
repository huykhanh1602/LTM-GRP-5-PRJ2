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
// Bảng điều khiển giải: luôn nhắm vòng sắp diễn ra tiếp theo.
// Giải MANUAL: chỉ có nút chủ giải bấm mở vòng.
// Giải AUTO: bảng đặt lịch, tới giờ vòng tự khởi tranh.
// ─────────────────────────────────────────────────────────────

const STATUS_LABELS = { pending: "chờ khởi tranh", in_progress: "đang diễn ra", completed: "đã kết thúc" };

// Vòng sắp diễn ra tiếp theo: vòng chưa mở đầu tiên, rồi vòng đang đấu, rồi vòng cuối.
function nextRound(rounds) {
  return (
    rounds.find((round) => round.status === "pending") ??
    rounds.find((round) => round.status === "in_progress") ??
    rounds.at(-1) ??
    null
  );
}

export default function AdminControlModal({ tournament, token, onClose, onUpdated }) {
  const rawRounds = tournament.raw?.rounds ?? [];
  const isAuto = tournament.startType === "AUTO";
  const targetRound = nextRound(rawRounds);
  const [roundAt, setRoundAt] = useState("");
  const [matchId, setMatchId] = useState(null);
  const [matchAt, setMatchAt] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Trận có mã trận (mọi vòng): ưu tiên chưa có kết quả để mặc định chọn "trận tiếp theo".
  const matchOptions = rawRounds
    .flatMap((round) => (round.matches ?? []).map((item) => ({ ...item, roundNo: round.round_no })))
    .filter((item) => item.match_id)
    .sort(
      (a, b) =>
        Number(Boolean(a.winner_id)) - Number(Boolean(b.winner_id)) || a.roundNo - b.roundNo,
    );

  useEffect(() => {
    setRoundAt(toLocalInputValue(targetRound?.scheduled_at));
    setMatchId(matchOptions[0]?.match_id ?? null);
    setMatchAt(toLocalInputValue(matchOptions[0]?.played_at ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRound?.id]);

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

  const canControl = targetRound?.status === "pending";

  return (
    <Modal
      title="Bảng điều khiển giải"
      subtitle="Điều khiển vòng sắp diễn ra và hoãn/dời lịch trận đấu"
      onClose={onClose}
    >
      {error && (
        <p className={`tl-banner tl-banner--${error.tone}`} role="status">
          {error.text}
        </p>
      )}

      <h3 className="tl-admin-title">⏰ Vòng sắp diễn ra</h3>
      <p className="tl-form-note">
        {targetRound
          ? `Vòng ${targetRound.round_no} · ${STATUS_LABELS[targetRound.status] ?? targetRound.status}`
          : "Giải chưa có vòng đấu."}
      </p>

      {!targetRound ? (
        <p className="tl-form-note">Giải chưa có vòng đấu.</p>
      ) : targetRound.status === "completed" ? (
        <p className="tl-form-note">🎉 Tất cả vòng đấu đã kết thúc.</p>
      ) : !canControl ? (
        <p className="tl-form-note">🟢 Vòng này đang diễn ra.</p>
      ) : isAuto ? (
        <>
          <label className="tl-form-label" htmlFor="tl-admin-round-at">
            Thời gian thi đấu
          </label>
          <input
            id="tl-admin-round-at"
            type="datetime-local"
            className="tl-form-input"
            value={roundAt}
            onChange={(event) => setRoundAt(event.target.value)}
          />
          <p className="tl-form-note">Tới thời gian trên, vòng sẽ tự động khởi tranh.</p>
          <div className="tl-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !targetRound}
              onClick={() =>
                run(
                  () =>
                    updateRoundSchedule(
                      tournament.id,
                      targetRound.id,
                      roundAt ? new Date(roundAt).toISOString() : null,
                      true,
                      token,
                    ),
                  "Lịch vòng đã cập nhật.",
                )
              }
            >
              💾 Lưu lịch vòng
            </button>
          </div>
        </>
      ) : (
        <div className="tl-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !targetRound}
            onClick={() =>
              run(
                () => triggerRoundStart(tournament.id, targetRound.id, token),
                "Vòng đã khởi tranh ngay.",
              )
            }
          >
            ▶ Bắt đầu ngay
          </button>
        </div>
      )}

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
                Vòng {item.roundNo} · {item.participant_a_name} vs {item.participant_b_name}
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
