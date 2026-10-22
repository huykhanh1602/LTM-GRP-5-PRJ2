// ─────────────────────────────────────────────────────────────
// Danh sách slot đăng ký khi giải ở trạng thái OPEN
// ─────────────────────────────────────────────────────────────
export default function RegistrationSlots({
  entries = [],
  capacity = 0,
  myEntryId = null,
  title = "Sơ đồ nhánh sẽ được bốc thăm sau khi khóa đăng ký",
  emptyText = "Suất trống",
}) {
  const total = Math.max(Number(capacity) || 0, entries.length);
  const emptySlots = Math.max(0, total - entries.length);

  return (
    <div className="tl-open-bracket">
      <div className="tl-open-bracket__note">
        <span aria-hidden="true">🎲</span>
        <div>
          <strong>{title}</strong>
          <p>
            Hiện có {entries.length}/{total} bot đã xác nhận. Các suất còn lại đang chờ thí sinh nộp
            bài.
          </p>
        </div>
      </div>

      <ul className="tl-seed-list">
        {entries.map((entry, index) => (
          <li key={entry.id} className={entry.id === myEntryId ? "is-me" : ""}>
            <span className="tl-seed-list__seed">#{index + 1}</span>
            <img src={entry.avatar} alt="" loading="lazy" />
            <div>
              <strong>{entry.teamName}</strong>
              <small>
                {entry.owner || "Thí sinh"} · {entry.rating} Elo
              </small>
            </div>
            <span className="tl-seed-list__check">✔</span>
          </li>
        ))}

        {Array.from({ length: emptySlots }).map((_, index) => (
          <li key={`empty-${index}`} className="is-empty">
            <span className="tl-seed-list__seed">#{entries.length + index + 1}</span>
            <span className="tl-seed-list__ghost">?</span>
            <div>
              <strong>{emptyText}</strong>
              <small>Đang chờ đăng ký</small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
