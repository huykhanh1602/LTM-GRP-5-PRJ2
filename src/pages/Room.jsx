import { useState } from "react";
import SubmitForm from "../components/SubmitForm.jsx";
import TeamSlot from "../components/TeamSlot.jsx";
import { PALETTE } from "../utils/colors.js";

// Phòng chờ: thấy trạng thái 2 đội, nộp code, bấm Sẵn sàng; cả 2 sẵn sàng thì đếm ngược.
export default function Room({ state, onSubmit, onReady, onLeave }) {
  const { room, countdown, error } = state;
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const me = room.teams.find((t) => t.isMe);
  const spectating = !me;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* trình duyệt chặn clipboard: bỏ qua, mã vẫn hiện trên màn hình */
    }
  }

  const waitingFor = room.teams.filter((t) => !t.isMe && !t.ready);
  let hint = "";
  if (spectating) hint = "Bạn đang xem. Trận sẽ tự chạy khi cả 2 đội sẵn sàng.";
  else if (room.status === "finished") hint = "Trận đã kết thúc. Hai đội có thể sẵn sàng để đấu lại.";
  else if (!me.submitted) hint = "Bước 1: nộp code của đội bạn.";
  else if (!me.ready) hint = "Bước 2: bấm Sẵn sàng khi bạn muốn bắt đầu.";
  else if (waitingFor.length) hint = "Đang chờ đối thủ…";

  return (
    <div className="room">
      <div className="room-head">
        <div>
          <div className="muted">Mã phòng</div>
          <div className="room-code">
            {room.code}
            <button className="btn small" onClick={copyCode}>{copied ? "Đã chép ✓" : "Chép mã"}</button>
          </div>
          <div className="muted">Gửi mã này cho đội đối thủ để họ vào phòng.</div>
        </div>
        <button className="btn" onClick={onLeave}>Rời phòng</button>
      </div>

      <div className="slots">
        {room.teams.map((t, i) => (
          <TeamSlot key={t.id} team={t} color={PALETTE[i % PALETTE.length]} />
        ))}
      </div>

      {!spectating && (
        <div className="card">
          <SubmitForm onSubmit={onSubmit} uploadedName={me.filename} locked={me.ready} />
          <div className="ready-row">
            <button
              className={`btn big ${me.ready ? "" : "primary"}`}
              disabled={!me.submitted || room.status === "countdown"}
              onClick={() => onReady(!me.ready)}
            >
              {me.ready ? "Hủy sẵn sàng" : "✔ Sẵn sàng"}
            </button>
          </div>
        </div>
      )}

      {hint && <p className="hint center">{hint}</p>}
      {error && <p className="err center">{error}</p>}

      {countdown != null && (
        <div className="countdown" role="status">
          <div className="countdown-label">Trận đấu bắt đầu sau</div>
          <div key={countdown} className="countdown-num">{countdown}</div>
        </div>
      )}
    </div>
  );
}
