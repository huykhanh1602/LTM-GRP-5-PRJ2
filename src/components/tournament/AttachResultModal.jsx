import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { getMatches } from "../../api.js";
import { apiErrorText, formatStartsAt } from "../../utils/tournamentApi.js";

// ─────────────────────────────────────────────────────────────
// Chủ giải gắn kết quả của một trận đấu thật vào nhánh
// ─────────────────────────────────────────────────────────────
export default function AttachResultModal({ slot, nameA, nameB, onClose, onAttached }) {
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