import { useState } from "react";
import { SUBMIT } from "../config.js";

// Form nộp code của đội mình. onSubmit(file) trả về Promise (lỗi thì throw Error có câu báo lỗi).
export default function SubmitForm({ onSubmit, uploadedName, locked }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState({ kind: "idle" }); // idle | sending | error

  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = "." + f.name.split(".").pop().toLowerCase();
    if (!SUBMIT.accept.includes(ext)) {
      setFile(null);
      return setStatus({ kind: "error", msg: `Chỉ nhận file ${SUBMIT.accept.join(", ")}.` });
    }
    if (f.size > SUBMIT.maxBytes) {
      setFile(null);
      return setStatus({
        kind: "error",
        msg: `File quá lớn (${Math.ceil(f.size / 1024)} KB), tối đa ${Math.floor(SUBMIT.maxBytes / 1024)} KB.`,
      });
    }
    setFile(f);
    setStatus({ kind: "idle" });
  }

  async function send() {
    setStatus({ kind: "sending" });
    try {
      await onSubmit(file);
      setFile(null);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", msg: err.message || "Nộp không thành công." });
    }
  }

  const busy = status.kind === "sending";
  return (
    <div className="submit-form">
      <h3>Code của đội bạn</h3>
      {uploadedName ? (
        <p className="uploaded">✅ Đã nộp: <b>{uploadedName}</b></p>
      ) : (
        <p className="hint">Chưa nộp code. Chọn file {SUBMIT.accept.join(", ")} (tối đa {Math.floor(SUBMIT.maxBytes / 1024)} KB).</p>
      )}

      <div className="submit-row">
        <label className={`btn ${locked || busy ? "disabled" : ""}`}>
          {file ? "Chọn file khác" : uploadedName ? "Nộp lại file khác" : "Chọn file…"}
          <input type="file" accept={SUBMIT.accept.join(",")} onChange={pick} disabled={locked || busy} hidden />
        </label>
        {file && <span className="picked">{file.name}</span>}
        <button className="btn primary" onClick={send} disabled={!file || busy || locked}>
          {busy ? "Đang gửi…" : "Nộp"}
        </button>
      </div>
      {locked && <p className="hint">Đang sẵn sàng nên không nộp lại được. Bấm "Hủy sẵn sàng" nếu muốn đổi code.</p>}
      {status.kind === "error" && <p className="err">{status.msg}</p>}
    </div>
  );
}
