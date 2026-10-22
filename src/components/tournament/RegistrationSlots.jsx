// ─────────────────────────────────────────────────────────────
// Danh sách người đã đăng ký khi giải ở trạng thái OPEN.
// Bấm vào một người sẽ mở trang cá nhân của họ.
// ─────────────────────────────────────────────────────────────
export default function RegistrationSlots({
  entries = [],
  capacity = 0,
  myEntryId = null,
  title = "Sơ đồ nhánh sẽ được xếp sau khi chủ giải khởi tranh",
  emptyText = "Suất trống",
  onOpenProfile,
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
            Hiện có {entries.length}
            {capacity ? `/${total}` : ""} người đã xác nhận tham gia.
          </p>
        </div>
      </div>

      <ul className="tl-seed-list">
        {entries.map((entry, index) => (
          <li key={entry.id} className={entry.id === myEntryId ? "is-me" : ""}>
            <span className="tl-seed-list__seed">#{entry.seed ?? index + 1}</span>
            <img src={entry.avatar} alt="" loading="lazy" />
            <div>
              <strong>
                {entry.teamName}
                {entry.id === myEntryId && <span className="tl-me-tag">Bạn</span>}
              </strong>
              <small>{entry.owner || "Thí sinh"}</small>
            </div>
            {onOpenProfile ? (
              <button
                type="button"
                className="tl-seed-list__profile"
                onClick={() => onOpenProfile(entry.id)}
              >
                Xem trang cá nhân
              </button>
            ) : (
              <span className="tl-seed-list__check">✔</span>
            )}
          </li>
        ))}

        {Array.from({ length: Math.min(emptySlots, 32) }).map((_, index) => (
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
