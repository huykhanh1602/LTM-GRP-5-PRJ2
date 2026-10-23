// ─────────────────────────────────────────────────────────────
// SubmissionModal — Modal nộp / cập nhật Code Bot cho vòng đấu
// (chỉ khi roundSubmissionMode = PER_ROUND).
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from "react";

export function SubmissionModal({ roundNo, deadline, submitting, onClose, onSubmit }) {
  const fileInput = useRef(null);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState(null);

  function pickFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result ?? ""));
    reader.onerror = () => setError("Không đọc được file. Hãy chọn file source code.");
    reader.readAsText(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const text = source.trim();
    if (!text) {
      setError("Source code không được để trống.");
      return;
    }
    setError(null);
    onSubmit({ roundNo, filename: fileName || "bot.py", source: text });
  }

  return (
    <div className="tm-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="tm-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <header className="tm-modal__head">
          <h3>📝 Nộp code cho vòng {roundNo}</h3>
          {deadline && (
            <span className="tm-countdown">
              ⏳ Hạn nộp: {new Date(deadline).toLocaleTimeString("vi-VN")}
            </span>
          )}
        </header>

        <label className="tm-file-drop">
          <input
            ref={fileInput}
            type="file"
            accept=".py,.js,.jsx,.cpp,.txt,text/plain"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          {fileName ? (
            <span>📎 {fileName} — bấm để chọn lại</span>
          ) : (
            <span>📁 Chọn file bot (python / javascript / cpp)…</span>
          )}
        </label>

        <textarea
          className="tm-code"
          rows={10}
          placeholder="Hoặc dán trực tiếp source code bot tại đây…"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />

        {error && <p className="tm-error">{error}</p>}

        <footer className="tm-modal__foot">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? "Đang nộp…" : "Nộp code"}
          </button>
        </footer>
      </form>
    </div>
  );
}