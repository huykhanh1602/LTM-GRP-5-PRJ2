// Thẻ trạng thái của một đội trong phòng chờ.
function stage(t) {
  if (t.ready) return { text: "Sẵn sàng", cls: "ready" };
  if (t.control === "human") return { text: "Chờ bằng chuột", cls: "submitted" };
  if (t.submitted) return { text: "Đã nộp code", cls: "submitted" };
  if (t.connected) return { text: "Đang chuẩn bị", cls: "joined" };
  return { text: "Chưa vào phòng", cls: "waiting" };
}

export default function TeamSlot({ team, color }) {
  const s = stage(team);
  const human = team.control === "human";
  return (
    <div className={`slot ${s.cls}`} style={{ "--team": color }}>
      <div className="slot-name">
        <span className="dot" /> {team.name || "Đang chờ đội…"}
        {team.isMe && <span className="me">Bạn</span>}
        <span className={`slot-control ${human ? "slot-control--human" : ""}`}>
          {human ? "🖱️ Chuột" : "🤖 Bot"}
        </span>
      </div>
      <div className="slot-status">{s.text}</div>
      <ul className="slot-steps">
        <li className={team.connected ? "done" : ""}>Vào phòng</li>
        <li className={human ? "done" : team.submitted ? "done" : ""}>
          {human ? "Chọn đấu bằng chuột" : `Nộp code${team.filename ? ` (${team.filename})` : ""}`}
        </li>
        <li className={team.ready ? "done" : ""}>Sẵn sàng</li>
      </ul>
    </div>
  );
}
