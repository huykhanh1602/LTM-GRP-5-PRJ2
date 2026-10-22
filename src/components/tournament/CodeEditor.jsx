import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";

const MONACO_THEME = "botvui-pastel";

// Theme Monaco bám theo bảng màu BotVui (:root trong App.css)
function defineTheme(monaco) {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "A79AB7", fontStyle: "italic" },
      { token: "keyword", foreground: "A987D9", fontStyle: "bold" },
      { token: "string", foreground: "D97706" },
      { token: "number", foreground: "F27FBA" },
      { token: "type", foreground: "3B82F6" },
      { token: "delimiter", foreground: "8B7B9A" },
    ],
    colors: {
      "editor.background": "#FFFBFC",
      "editor.foreground": "#574568",
      "editorLineNumber.foreground": "#CBB9DB",
      "editorLineNumber.activeForeground": "#A987D9",
      "editor.selectionBackground": "#FEDEE9",
      "editor.inactiveSelectionBackground": "#FDF0F6",
      "editor.lineHighlightBackground": "#FAF7FF",
      "editorCursor.foreground": "#F27FBA",
      "editorIndentGuide.background1": "#F3E8FA",
      "editorIndentGuide.activeBackground1": "#D4B8F5",
      "editorGutter.background": "#FFFBFC",
      "editorWidget.background": "#FFFFFF",
      "editorWidget.border": "#FEDEE9",
      "scrollbarSlider.background": "#FEDEE9",
      "scrollbarSlider.hoverBackground": "#FDA3D3",
    },
  });
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily:
    "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
  fontLigatures: true,
  padding: { top: 14, bottom: 14 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  renderLineHighlight: "all",
  roundedSelection: true,
  tabSize: 4,
  automaticLayout: true,
  wordWrap: "on",
  folding: true,
  lineNumbersMinChars: 3,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
};

// ─────────────────────────────────────────────────────────────
// CodeEditor — Monaco editor bọc theme BotVui, có fallback
// ─────────────────────────────────────────────────────────────
export default function CodeEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  height = 360,
}) {
  const [mounted, setMounted] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Nếu CDN Monaco không tải được (offline) → dùng editor dự phòng
  useEffect(() => {
    if (mounted) return undefined;
    const timer = setTimeout(() => setFallback(true), 9000);
    return () => clearTimeout(timer);
  }, [mounted]);

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  return (
    <div className="tl-editor" data-lang={language}>
      <div className="tl-editor__chrome">
        <span className="tl-editor__dots" aria-hidden="true">
          <i /> <i /> <i />
        </span>
        <span className="tl-editor__file">
          {language === "python" ? "bot.py" : language === "javascript" ? "bot.js" : "bot.cpp"}
        </span>
        <span className="tl-editor__engine">
          {fallback ? "Editor dự phòng" : "Monaco"}
        </span>
      </div>

      <div className="tl-editor__body" style={{ height }}>
        {fallback ? (
          <textarea
            className="tl-editor__fallback"
            value={value}
            spellCheck={false}
            readOnly={readOnly}
            onChange={(event) => onChange?.(event.target.value)}
            aria-label="Soạn mã bot"
          />
        ) : (
          <Editor
            height="100%"
            language={language}
            theme={MONACO_THEME}
            value={value}
            onChange={(next) => onChange?.(next ?? "")}
            beforeMount={defineTheme}
            onMount={() => {
              setMounted(true);
              setFallback(false);
            }}
            loading={<div className="tl-editor__loading">Đang tải Monaco Editor…</div>}
            options={{ ...EDITOR_OPTIONS, readOnly }}
          />
        )}
      </div>

      <div className="tl-editor__status">
        <span>{lineCount} dòng</span>
        <span>UTF-8</span>
        <span>{language === "python" ? "Python 3.11" : language === "javascript" ? "Node 20" : "C++17"}</span>
        <span className="tl-editor__status-spacer" />
        <span>{readOnly ? "🔒 Chỉ đọc" : "✍️ Có thể chỉnh sửa"}</span>
      </div>
    </div>
  );
}
