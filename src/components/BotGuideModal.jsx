import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────
   Python starter code (make_move)
   ───────────────────────────────────────────── */
const PYTHON_STARTER = `"""Bot mẫu — chọn ngẫu nhiên một nước đi hợp lệ."""

from __future__ import annotations
import random

# 8 hướng, mỗi bước đi đúng 1 ô.
_DIRECTIONS = (
    (-1, -1), (0, -1), (1, -1),
    (-1,  0),          (1,  0),
    (-1,  1), (0,  1), (1,  1),
)


def make_move(board_state, my_pieces, opponent_pieces, config):
    \"\"\"Trả về nước đi dạng { "piece_id": str, "action_type": "MOVE", "to": [x, y] }
    hoặc None nếu bỏ lượt.\"\"\"
    width = board_state["width"]
    height = board_state["height"]

    # Tập ô chướng ngại vật
    obstacles = set()
    for tile in board_state.get("special_tiles", []):
        if tile.get("type") == "OBSTACLE":
            obstacles.add((tile["pos"][0], tile["pos"][1]))

    # Tập ô quân mình đang đứng
    friendly = {(p["pos"][0], p["pos"][1]) for p in my_pieces}

    # Duyệt từng quân, thử 8 hướng
    candidates = []
    for piece in my_pieces:
        x, y = piece["pos"]
        for dx, dy in _DIRECTIONS:
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if (nx, ny) in obstacles:
                continue
            if (nx, ny) in friendly:
                continue
            candidates.append({
                "piece_id": piece["id"],
                "action_type": "MOVE",
                "to": [nx, ny],
            })

    return random.choice(candidates) if candidates else None
`;

const CPP_STARTER = `// Bot C++ mẫu — đọc stdin, xuất nước đi qua stdout.
#include <iostream>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
using namespace std;

int main() {
    string line;
    while (getline(cin, line)) {
        json input = json::parse(line);
        json board_state = input["board_state"];
        json my_pieces = input["my_pieces"];
        json opponent_pieces = input["opponent_pieces"];
        json config = input["config"];

        // --- Logic bot của bạn ở đây ---
        json move = nullptr;

        // Xuất nước đi dạng JSON (dòng mới kết thúc)
        cout << (move == nullptr ? "null" : move.dump()) << endl;
    }
    return 0;
}
`;

const JS_STARTER = `// Bot Node.js mẫu — đọc stdin, xuất nước đi qua stdout.
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const input = JSON.parse(line);
  const { board_state, my_pieces, opponent_pieces, config } = input;

  // --- Logic bot của bạn ở đây ---
  let move = null;

  // Xuất nước đi dạng JSON (dòng mới kết thúc)
  console.log(move !== null ? JSON.stringify(move) : "null");
});
`;

/* ─────────────────────────────────────────────
   Tab definitions
   ───────────────────────────────────────────── */
const TABS = [
  { id: "python", label: "Python 🐍" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
  { id: "rules", label: "Quy định & Giới hạn" },
];

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
export default function BotGuideModal({ onClose }) {
  const [tab, setTab] = useState("python");
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef(null);

  // Click outside → close
  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) onClose?.();
    },
    [onClose],
  );

  // Escape key → close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function copyCode() {
    let code = "";
    if (tab === "python") code = PYTHON_STARTER;
    else if (tab === "cpp") code = CPP_STARTER;
    else if (tab === "javascript") code = JS_STARTER;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div className="bg-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="bg-modal">
        {/* Close button */}
        <button className="bg-modal__close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>

        {/* Header */}
        <div className="bg-modal__head">
          <span className="bg-modal__icon">📖</span>
          <h2>Hướng dẫn viết Bot</h2>
          <p>Tham khảo cấu trúc bot chuẩn và các quy định khi tham gia đấu trường.</p>
        </div>

        {/* Tabs */}
        <div className="bg-modal__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`bg-modal__tab ${tab === t.id ? "bg-modal__tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-modal__body">
          {tab === "python" && (
            <div className="bg-tab-content">
              <h3>Python 3.11 — Hàm <code>make_move(state)</code></h3>
              <p>
                Bot Python nhận tham số <code>board_state</code>, <code>my_pieces</code>,
                <code>opponent_pieces</code>, <code>config</code> và trả về dict nước đi.
              </p>
              <div className="bg-code-block">
                <pre><code>{PYTHON_STARTER}</code></pre>
              </div>
              <button className="btn small primary" onClick={copyCode}>
                {copied ? "✅ Đã sao chép!" : "📋 Sao chép code mẫu"}
              </button>
            </div>
          )}

          {tab === "cpp" && (
            <div className="bg-tab-content">
              <h3>C++17 — Đọc stdin / Ghi stdout</h3>
              <p>
                Bot C++ nhận JSON từ <strong>stdin</strong> (mỗi dòng là một lượt) và xuất
                nước đi dạng JSON qua <strong>stdout</strong> (kết thúc bằng dòng mới).
              </p>
              <p>
                Cấu trúc input: <code>{"{ board_state, my_pieces, opponent_pieces, config }"}</code>
              </p>
              <div className="bg-code-block">
                <pre><code>{CPP_STARTER}</code></pre>
              </div>
              <button className="btn small primary" onClick={copyCode}>
                {copied ? "✅ Đã sao chép!" : "📋 Sao chép code mẫu"}
              </button>
            </div>
          )}

          {tab === "javascript" && (
            <div className="bg-tab-content">
              <h3>Node.js 20 — Đọc stdin / Ghi stdout</h3>
              <p>
                Bot JavaScript nhận JSON từ <strong>stdin</strong> (mỗi dòng là một lượt) và
                xuất nước đi dạng JSON qua <strong>stdout</strong>.
              </p>
              <p>
                Cấu trúc input: <code>{"{ board_state, my_pieces, opponent_pieces, config }"}</code>
              </p>
              <div className="bg-code-block">
                <pre><code>{JS_STARTER}</code></pre>
              </div>
              <button className="btn small primary" onClick={copyCode}>
                {copied ? "✅ Đã sao chép!" : "📋 Sao chép code mẫu"}
              </button>
            </div>
          )}

          {tab === "rules" && (
            <div className="bg-tab-content">
              <h3>⚖️ Quy định & Ràng buộc</h3>

              <div className="bg-rule-card">
                <div className="bg-rule-card__icon">📦</div>
                <div className="bg-rule-card__body">
                  <strong>Dung lượng file</strong>
                  <p>File bot tối đa <b>100 KB</b>. File vượt quá sẽ bị từ chối khi nộp.</p>
                </div>
              </div>

              <div className="bg-rule-card">
                <div className="bg-rule-card__icon">⏱️</div>
                <div className="bg-rule-card__body">
                  <strong>Thời gian phản hồi (Timeout)</strong>
                  <p>
                    Mỗi nước đi phải trả về trong vòng <b>1 – 2 giây</b>.
                    Quá thời gian, bot bị tính lỗi và đội bạn mất lượt (hoặc bị xử thua tùy luật giải).
                  </p>
                </div>
              </div>

              <div className="bg-rule-card">
                <div className="bg-rule-card__icon">🔒</div>
                <div className="bg-rule-card__body">
                  <strong>Các module / thao tác bị cấm</strong>
                  <p>
                    Bot <b>không được</b> sử dụng các module can thiệp hệ thống:
                  </p>
                  <ul>
                    <li><code>import os</code> — truy xuất biến môi trường, thực thi lệnh</li>
                    <li><code>import socket</code> — kết nối mạng</li>
                    <li><code>import subprocess</code> — chạy tiến trình con</li>
                    <li><code>open()</code> — đọc / ghi file (kể cả log)</li>
                    <li><code>import requests</code>, <code>urllib</code> — gọi HTTP</li>
                    <li><code>import threading</code>, <code>multiprocessing</code> — đa luồng / đa tiến trình</li>
                  </ul>
                  <p className="muted">
                    Vi phạm sẽ bị <b>hủy bot</b> và <b>cấm tham gia giải đấu</b>.
                  </p>
                </div>
              </div>

              <div className="bg-rule-card">
                <div className="bg-rule-card__icon">🧪</div>
                <div className="bg-rule-card__body">
                  <strong>Chạy thử bot</strong>
                  <p>
                    Bạn có thể dùng nút <b>"Chơi Demo (Chạy thử Bot)"</b> trong phòng đấu
                    để kiểm tra bot của mình trước khi tham gia trận chính thức.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}