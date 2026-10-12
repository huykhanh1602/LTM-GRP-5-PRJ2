// Kênh THẬT tới server: WebSocket cho trạng thái phòng + trận trực tiếp,
// HTTP (multipart) để nộp file code. Cùng giao diện với mockServer.js.
// Định dạng tin nhắn: xem docs/PROTOCOL.md.

export function createSocketChannel({ wsUrl, httpUrl, code, teamName, role }) {
  const listeners = new Set();
  const emit = (m) => listeners.forEach((l) => l(m));

  const ws = new WebSocket(`${wsUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(code)}`);
  ws.onopen = () =>
    ws.send(JSON.stringify({ type: "join_room", code, team_name: teamName, role }));
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return; // bỏ qua tin không phải JSON
    }
    emit(msg);
  };
  ws.onerror = () => emit({ type: "error", message: "Không kết nối được tới server." });
  ws.onclose = () => emit({ type: "error", message: "Mất kết nối với server." });

  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    async submitCode(file) {
      const body = new FormData();
      body.append("team_name", teamName);
      body.append("file", file);
      const res = await fetch(`${httpUrl}/api/rooms/${encodeURIComponent(code)}/submissions`, {
        method: "POST",
        body,
      });
      if (!res.ok) throw new Error((await res.text()) || `Lỗi ${res.status}`);
      return res.json();
    },
    close() {
      ws.onclose = null;
      ws.close();
      listeners.clear();
    },
  };
}
