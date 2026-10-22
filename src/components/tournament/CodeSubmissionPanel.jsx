import { useEffect, useRef, useState } from "react";
import CodeEditor from "./CodeEditor.jsx";
import { LANGUAGE_OPTIONS } from "../../mock/tournamentLobby.mock.js";

const ACCEPTED_EXTENSIONS = { ".py": "python", ".js": "javascript", ".cpp": "cpp" };
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const DRY_RUN_STEPS = [
  { text: "Khởi tạo sandbox • Python 3.11 • 512MB RAM", tone: "info" },
  { text: "Nạp engine.rps_chess và kiểm tra import…", tone: "info" },
  { text: "Kiểm tra cú pháp: OK ✓", tone: "success" },
  { text: "Đấu thử 3 ván với bot mẫu BotSample #2", tone: "info" },
  { text: "Ván 1 — Alpha Bot thắng · 62% base còn lại", tone: "success" },
  { text: "Ván 2 — Alpha Bot thắng · bắt base ở nước 24", tone: "success" },
  { text: "Ván 3 — Hòa · hết thời gian, replay được kích hoạt", tone: "warn" },
  { text: "Dry run hoàn tất: 2 thắng · 1 hòa · phản hồi TB 41ms", tone: "success" },
];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function nowLabel() {
  return new Date().toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────
// Khu vực nộp code bot: tab Soạn code (Monaco) | tab Tải file
// ─────────────────────────────────────────────────────────────
export default function CodeSubmissionPanel({ tournament }) {
  const locked = ["in_progress", "completed", "cancelled"].includes(tournament.status);

  const [tab, setTab] = useState("code");
  const [language, setLanguage] = useState(tournament.mySubmission.language || "python");
  const [source, setSource] = useState(
    () =>
      LANGUAGE_OPTIONS.find((l) => l.id === (tournament.mySubmission.language || "python"))
        ?.template ?? "",
  );
  const [submission, setSubmission] = useState(tournament.mySubmission);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Dry run
  const [dryRunning, setDryRunning] = useState(false);
  const [dryLogs, setDryLogs] = useState([]);
  const dryTimerRef = useRef(null);

  // Upload
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadTimerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(
    () => () => {
      clearInterval(dryTimerRef.current);
      clearInterval(uploadTimerRef.current);
    },
    [],
  );

  function changeLanguage(nextId) {
    setLanguage(nextId);
    const template = LANGUAGE_OPTIONS.find((l) => l.id === nextId)?.template ?? "";
    setSource(template);
    setDryLogs([]);
    setFeedback("");
  }

  // ── Dry run mô phỏng ──────────────────────────────────────
  function runDryRun() {
    if (dryRunning) return;
    clearInterval(dryTimerRef.current);
    setDryRunning(true);
    setDryLogs([]);
    setFeedback("");

    let index = 0;
    dryTimerRef.current = setInterval(() => {
      const step = DRY_RUN_STEPS[index];
      if (!step) {
        clearInterval(dryTimerRef.current);
        setDryRunning(false);
        return;
      }
      setDryLogs((prev) => [...prev, { ...step, time: new Date().toLocaleTimeString("vi-VN") }]);
      index += 1;
    }, 620);
  }

  // ── Nộp bot ───────────────────────────────────────────────
  function submitBot() {
    if (locked || submitting) return;
    if (tab === "upload" && !file) {
      setFileError("Hãy tải lên một file thuật toán trước khi nộp.");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    setTimeout(() => {
      setSubmission({
        status: tournament.status === "draft" ? "draft" : "ready",
        updatedAt: nowLabel(),
        source: tab === "code" ? "editor" : "upload",
        fileName:
          tab === "code"
            ? `alphabot_v3${LANGUAGE_OPTIONS.find((l) => l.id === language)?.ext ?? ".py"}`
            : file?.name ?? "bot.py",
        language,
      });
      setSubmitting(false);
      setFeedback(
        tournament.status === "draft"
          ? "💾 Đã lưu bản nháp. Bot sẽ được gửi chính thức khi giải mở đăng ký."
          : "🎉 Nộp bot thành công! Bot đang ở trạng thái sẵn sàng thi đấu.",
      );
    }, 900);
  }

  // ── Xử lý file upload ─────────────────────────────────────
  function handleFiles(fileList) {
    const picked = fileList?.[0];
    if (!picked) return;

    const dotIndex = picked.name.lastIndexOf(".");
    const ext = dotIndex >= 0 ? picked.name.slice(dotIndex).toLowerCase() : "";
    if (!ACCEPTED_EXTENSIONS[ext]) {
      setFileError("Chỉ chấp nhận file .py, .js hoặc .cpp.");
      setFile(null);
      setUploadProgress(0);
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setFileError("File vượt quá 2MB. Hãy nén hoặc rút gọn thuật toán.");
      setFile(null);
      setUploadProgress(0);
      return;
    }

    setFileError("");
    setFile({ name: picked.name, size: picked.size, ext });
    setUploadProgress(0);

    clearInterval(uploadTimerRef.current);
    uploadTimerRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(uploadTimerRef.current);
          return 100;
        }
        return Math.min(100, prev + 14);
      });
    }, 130);
  }

  function removeFile() {
    clearInterval(uploadTimerRef.current);
    setFile(null);
    setUploadProgress(0);
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const isReady = submission.status === "ready";
  const statusTone = locked ? "locked" : isReady ? "ready" : submission.status === "draft" ? "draft" : "idle";

  return (
    <section className="tl-card tl-submit" aria-label="Khu vực nộp code bot">
      <header className="tl-card__head">
        <div>
          <h2 className="tl-card__title">Nộp Bot dự thi</h2>
          <p className="tl-card__desc">
            {locked
              ? "Giải đã khóa nhận bài — bản nộp cuối cùng đang được sử dụng."
              : "Soạn trực tiếp hoặc tải file thuật toán, sau đó chạy dry run trước khi nộp."}
          </p>
        </div>
        <span className={`tl-submit__state tl-submit__state--${statusTone}`}>
          {statusTone === "locked" && "🔒 Đã khóa"}
          {statusTone === "ready" && "✅ Đã nộp sẵn sàng"}
          {statusTone === "draft" && "📝 Bản nháp"}
          {statusTone === "idle" && "⏳ Chưa nộp"}
        </span>
      </header>

      <div className="tl-tabs tl-tabs--pill" role="tablist" aria-label="Hình thức nộp bot">
        <button
          role="tab"
          aria-selected={tab === "code"}
          className={`tl-tab ${tab === "code" ? "is-active" : ""}`}
          onClick={() => setTab("code")}
        >
          ⌨️ Soạn code
        </button>
        <button
          role="tab"
          aria-selected={tab === "upload"}
          className={`tl-tab ${tab === "upload" ? "is-active" : ""}`}
          onClick={() => setTab("upload")}
        >
          📁 Tải file thuật toán
        </button>
      </div>

      {tab === "code" ? (
        <div className="tl-submit__code">
          <div className="tl-submit__toolbar">
            <label className="tl-select">
              <span>Ngôn ngữ</span>
              <select
                value={language}
                disabled={locked}
                onChange={(event) => changeLanguage(event.target.value)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn small tl-btn-ghost"
              onClick={runDryRun}
              disabled={locked || dryRunning}
            >
              {dryRunning ? "⏳ Đang chạy…" : "▶ Chạy thử Dry Run"}
            </button>
          </div>

          <CodeEditor
            value={source}
            onChange={setSource}
            language={language}
            readOnly={locked}
            height={330}
          />

          {(dryLogs.length > 0 || dryRunning) && (
            <div className="tl-console" role="log" aria-live="polite">
              <div className="tl-console__head">
                <span>Dry run console</span>
                <span className="tl-console__tag">sandbox</span>
              </div>
              {dryLogs.map((log, index) => (
                <p key={`${log.time}-${index}`} className={`tl-console__line is-${log.tone}`}>
                  <time>{log.time}</time>
                  {log.text}
                </p>
              ))}
              {dryRunning && <p className="tl-console__line is-info">▌</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="tl-submit__upload">
          <div
            className={`tl-dropzone ${dragOver ? "is-dragover" : ""} ${
              file ? "has-file" : ""
            } ${locked ? "is-locked" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!locked) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (!locked) handleFiles(event.dataTransfer.files);
            }}
            onClick={() => !locked && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
          >
            <span className="tl-dropzone__icon" aria-hidden="true">
              {file ? "🧠" : "⬆️"}
            </span>
            <p className="tl-dropzone__title">
              {file ? "File đã sẵn sàng" : "Kéo & thả file thuật toán vào đây"}
            </p>
            <p className="tl-dropzone__hint">
              Hỗ trợ <b>.py</b> · <b>.js</b> · <b>.cpp</b> — tối đa 2MB. Hoặc bấm để chọn file.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".py,.js,.cpp"
              hidden
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>

          {fileError && <p className="tl-form-error">{fileError}</p>}

          {file && (
            <div className="tl-file-card">
              <span className="tl-file-card__ext">{file.ext.replace(".", "")}</span>
              <div className="tl-file-card__body">
                <strong>{file.name}</strong>
                <span>{formatSize(file.size)} · Bot hợp lệ</span>
                <div className="tl-progress">
                  <span style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
              <span className="tl-file-card__status">
                {uploadProgress >= 100 ? "✔ Đã tải lên" : `${uploadProgress}%`}
              </span>
              {!locked && (
                <button
                  type="button"
                  className="tl-icon-btn"
                  onClick={removeFile}
                  aria-label="Xóa file"
                  title="Xóa file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <ul className="tl-upload-notes">
            <li>File được quét virus và giới hạn quyền đọc trong sandbox.</li>
            <li>Bot chạy Python 3.11 / Node 20 / C++17, thời gian suy nghĩ ≤ 500ms.</li>
            <li>Chỉ bản nộp gần nhất trước giờ khóa đăng ký được tính.</li>
          </ul>
        </div>
      )}

      <div className="tl-submit__footer">
        <div className="tl-submit__last">
          {submission.updatedAt ? (
            <>
              <span>Bản nộp gần nhất</span>
              <b>{submission.fileName}</b>
              <small>
                {submission.updatedAt} ·{" "}
                {submission.source === "upload" ? "tải file" : "soạn trực tiếp"}
              </small>
            </>
          ) : (
            <span>Bạn chưa nộp bot cho giải đấu này.</span>
          )}
        </div>

        <button
          type="button"
          className="btn primary tl-submit__btn"
          disabled={locked || submitting}
          onClick={submitBot}
        >
          {submitting
            ? "⏳ Đang gửi…"
            : tournament.status === "draft"
              ? "💾 Lưu bản nháp"
              : locked
                ? "🔒 Giải đã khóa nộp bài"
                : isReady
                  ? "🔁 Nộp lại bot"
                  : "🚀 Xác nhận nộp Bot"}
        </button>
      </div>

      {feedback && <p className="tl-form-ok">{feedback}</p>}
      {tournament.notice && !feedback && <p className="tl-submit__notice">{tournament.notice}</p>}
    </section>
  );
}
