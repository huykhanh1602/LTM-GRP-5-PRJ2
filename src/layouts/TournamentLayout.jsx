// ─────────────────────────────────────────────────────────────
// TournamentLayout — khung trang dùng chung cho khu vực giải đấu.
// Kế thừa App Shell (topbar, background, theme) của App.jsx.
// ─────────────────────────────────────────────────────────────
export default function TournamentLayout({ tournament, onBack, actions, children }) {
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
          <span>{tournament.game.name}</span>
          <i aria-hidden="true">/</i>
          <strong>Phòng chờ giải đấu</strong>
        </nav>

        {actions}
      </div>

      <div className="tl-shell">{children}</div>
    </div>
  );
}
