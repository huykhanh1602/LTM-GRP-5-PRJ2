import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import {
  rescheduleMatch,
  startTournament,
  triggerRoundStart,
  updateRoundSchedule,
  updateTournamentControls,
  updateTournamentSchedule,
} from "../../api.js";
import { apiErrorText, participantUnit } from "../../utils/tournamentApi.js";
import { getRoundLabels } from "../../utils/tournamentView.js";

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
// Bảng điều khiển giải: chưa có sơ đồ thì chọn giờ khởi tranh (tự gen nhánh);
// đã có sơ đồ thì mặc định chỉ hiện vòng đang diễn ra + vòng kế tiếp để đặt lịch.
// Vòng kế tiếp tự dịch dần theo tiến trình, tới Chung kết thì hết mục để đặt.
// ─────────────────────────────────────────────────────────────

const STATUS_LABELS = { pending: "chờ khởi tranh", in_progress: "đang diễn ra", completed: "đã kết thúc" };
const STATUS_PILL = { pending: "", in_progress: "tl-pill--green", completed: "tl-pill--gold" };

// Vòng cần điều khiển: vòng đang diễn ra (để theo dõi) + vòng pending kế tiếp (để đặt lịch).
function focusRounds(rounds) {
  const running = rounds.find((round) => round.status === "in_progress");
  const nextPending = rounds.find((round) => round.status === "pending");
  const picked = [running, nextPending].filter(Boolean);
  if (picked.length === 0) return rounds.length > 0 ? [rounds.at(-1)] : [];
  return [...new Set(picked)].sort((a, b) => a.round_no - b.round_no);
}

export default function AdminControlModal({ tournament, token, onClose, onUpdated }) {
  const rawRounds = tournament.raw?.rounds ?? [];
  const hasBracket = rawRounds.length > 0;
  const labels = getRoundLabels(rawRounds.length, tournament.format);
  const visibleRounds = focusRounds(rawRounds);
  const closesAt = tournament.registrationClosesAt
    ? new Date(tournament.registrationClosesAt).getTime()
    : null;
  const regClosed = closesAt === null || Date.now() > closesAt;
  const [kickoffAt, setKickoffAt] = useState(() => toLocalInputValue(tournament.raw?.starts_at));
  const [controlsMode, setControlsMode] = useState(() => tournament.raw?.config?.allowedControls ?? "BOT");
  const [roundAtById, setRoundAtById] = useState({});
  const [matchId, setMatchId] = useState(null);
  const [matchAt, setMatchAt] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setControlsMode(tournament.raw?.config?.allowedControls ?? "BOT");
  }, [tournament.id, tournament.raw?.config?.allowedControls]);

  // Trận có mã trận (mọi vòng): ưu tiên chưa có kết quả để mặc định chọn "trận tiếp theo".
  const matchOptions = rawRounds
    .flatMap((round) => (round.matches ?? []).map((item) => ({ ...item, roundNo: round.round_no })))
    .filter((item) => item.match_id)
    .sort(
      (a, b) =>
        Number(Boolean(a.winner_id)) - Number(Boolean(b.winner_id)) || a.roundNo - b.roundNo,
    );
  const firstMatchKey = matchOptions[0]?.match_id ?? null;
  const roundKey = rawRounds.map((round) => round.id).join(",");

  // Chỉ điền sẵn cho vòng chưa có giá trị, giữ nguyên giờ chủ giải đang gõ.
  useEffect(() => {
    setRoundAtById((prev) => {
      const next = { ...prev };
      for (const round of rawRounds) {
        if (!(round.id in next)) next[round.id] = toLocalInputValue(round.scheduled_at);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  useEffect(() => {
    const picked = matchOptions.find((item) => item.match_id === firstMatchKey);
    setMatchId(firstMatchKey);
    setMatchAt(toLocalInputValue(picked?.played_at ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMatchKey]);

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
      title="Bảng điều khiển giải"
      subtitle="Điều khiển lịch khởi tranh, kiểu đấu (bot/chuột) và hoãn/dời lịch trận"
      onClose={onClose}
    >
      {error && (
        <p className={`tl-banner tl-banner--${error.tone}`} role="status">
          {error.text}
        </p>
      )}

      {!hasBracket ? (
        <>
          <h3 className="tl-admin-title">⛳ Khởi tranh — tạo sơ đồ tự động</h3>
          <label className="tl-form-label" htmlFor="tl-admin-kickoff">
            Thời gian khởi tranh
          </label>
          <input
            id="tl-admin-kickoff"
            type="datetime-local"
            className="tl-form-input"
            value={kickoffAt}
            onChange={(event) => setKickoffAt(event.target.value)}
          />
          <p className="tl-form-note">
            Tới thời gian này hệ thống tự động tạo sơ đồ nhánh (khi đã đóng đơn và đủ tối thiểu 2
            người/đội). Muốn bắt đầu ngay thì bấm nút khởi tranh.
          </p>
          <div className="tl-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => {
                if (kickoffAt && closesAt !== null && Date.parse(kickoffAt) <= closesAt) {
                  setError({ tone: "err", text: "Thời gian khởi tranh phải sau thời gian đóng đơn." });
                  return;
                }
                run(
                  () =>
                    updateTournamentSchedule(
                      tournament.id,
                      kickoffAt ? new Date(kickoffAt).toISOString() : null,
                      token,
                    ),
                  "Lịch khởi tranh đã lưu.",
                );
              }}
            >
              💾 Lưu lịch khởi tranh
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || tournament.registered < 2 || !regClosed}
              title={!regClosed
                ? "Chỉ khởi tranh sau thời gian đóng đơn"
                : tournament.registered < 2
                  ? `Cần ít nhất 2 ${participantUnit(tournament.participantMode)} đăng ký`
                  : undefined}
              onClick={() => {
                // Khởi tranh ngay thì ngày khởi tranh là bây giờ, không giữ giờ lịch đã gõ.
                const nowIso = new Date().toISOString();
                run(async () => {
                  await updateTournamentSchedule(tournament.id, nowIso, token);
                  return startTournament(tournament.id, token);
                }, "Giải đã khởi tranh, sơ đồ nhánh đã được xếp.");
              }}
            >
              ⚔️ Khởi tranh ngay
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="tl-admin-title">⏰ Vòng sắp diễn ra</h3>
          <div className="tl-admin-rounds">
            {visibleRounds.map((round) => {
              const label = labels[round.round_no - 1] ?? `Vòng ${round.round_no}`;
              const title = label.startsWith("Vòng") ? label : `Vòng ${round.round_no} · ${label}`;
              const prevCompleted =
                round.round_no === 1 ||
                rawRounds.some((item) => item.round_no === round.round_no - 1 && item.status === "completed");
              const atValue = roundAtById[round.id] ?? "";
              return (
                <div className="tl-admin-round" key={round.id}>
                  <div className="tl-admin-round__head">
                    <h4>{title}</h4>
                    <span className={`tl-pill ${STATUS_PILL[round.status] ?? ""}`}>
                      {STATUS_LABELS[round.status] ?? round.status}
                    </span>
                  </div>

                  {round.status === "completed" ? (
                    <p className="tl-form-note">🎉 Vòng này đã kết thúc.</p>
                  ) : round.status === "in_progress" ? (
                    <p className="tl-form-note">🟢 Vòng này đang diễn ra.</p>
                  ) : (
                    <>
                      <label className="tl-form-label" htmlFor={`tl-admin-round-at-${round.id}`}>
                        Thời gian khởi tranh
                      </label>
                      <input
                        id={`tl-admin-round-at-${round.id}`}
                        type="datetime-local"
                        className="tl-form-input"
                        value={atValue}
                        onChange={(event) =>
                          setRoundAtById((prev) => ({ ...prev, [round.id]: event.target.value }))
                        }
                      />
                      <p className="tl-form-note">
                        {prevCompleted
                          ? "Tới thời gian trên, vòng sẽ tự động khởi tranh."
                          : "Vòng trước chưa kết thúc — đặt giờ trước, tới giờ vòng sẽ tự mở sau khi vòng trước xong."}
                      </p>
                      <div className="tl-actions">
                        <button
                          type="button"
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                updateRoundSchedule(
                                  tournament.id,
                                  round.id,
                                  atValue ? new Date(atValue).toISOString() : null,
                                  true,
                                  token,
                                ),
                              `Lịch vòng ${round.round_no} đã cập nhật.`,
                            )
                          }
                        >
                          💾 Lưu lịch vòng {round.round_no}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy || !prevCompleted}
                          title={prevCompleted ? undefined : "Vòng trước chưa kết thúc"}
                          onClick={() =>
                            run(
                              () => triggerRoundStart(tournament.id, round.id, token),
                              `Vòng ${round.round_no} đã khởi tranh ngay.`,
                            )
                          }
                        >
                          ▶ Bắt đầu ngay
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="tl-admin-title">🎮 Kiểu điều khiển trong trận</h3>
      <label className="tl-form-label" htmlFor="tl-admin-controls">
        Cho phép đấu
      </label>
      <select
        id="tl-admin-controls"
        className="tl-form-input"
        value={controlsMode}
        onChange={(event) => setControlsMode(event.target.value)}
      >
        <option value="BOT">Chỉ bot — mỗi người nộp code, máy tự đánh</option>
        <option value="HUMAN">Chỉ chuột — người tự di chuyển từng lượt</option>
        <option value="BOTH">Cả hai — mỗi người chọn một kiểu trước ván</option>
      </select>
      <p className="tl-form-note">
        "Cả hai" không nghĩa là một đội dùng cả bot lẫn chuột: trước ván, người chơi chọn một trong hai. Đã nộp bot thì ván đó đánh bằng bot, chọn chuột thì cả ván dùng chuột và không nộp bot. Áp dụng từ ván kế tiếp.
      </p>
      <div className="tl-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => run(async () => {
            const updated = await updateTournamentControls(tournament.id, controlsMode, token);
            if (updated.config?.allowedControls !== controlsMode) {
              throw new Error("Máy chủ chưa xác nhận đã lưu kiểu điều khiển. Hãy tải lại giải và thử lại.");
            }
            return updated;
          }, "Đã lưu kiểu điều khiển.")}
        >
          💾 Lưu kiểu điều khiển
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
