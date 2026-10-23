import { useEffect } from "react";

export default function Modal({ title, subtitle, onClose, children, footer }) {
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