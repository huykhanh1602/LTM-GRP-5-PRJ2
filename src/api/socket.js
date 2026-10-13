// Kênh thật: WebSocket cho trạng thái phòng + trận trực tiếp, HTTP để nộp bot.
// Định dạng tin nhắn: xem docs/PROTOCOL.md.

export function createSocketChannel({ wsUrl, httpUrl, code, teamName, role, teamId }) {
    const listeners = new Set();
    const emit = (m) => listeners.forEach((l) => l(m));
    let playerToken = null;

    const ws = new WebSocket(`${wsUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(code)}`);
    ws.onopen = () =>
        ws.send(
            JSON.stringify({ type: "join_room", code, team_name: teamName, role, team_id: teamId }),
        );
    ws.onmessage = (e) => {
        let msg;
        try {
            msg = JSON.parse(e.data);
        } catch {
            return; // bỏ qua tin không phải JSON
        }
        if (msg.type === "joined") playerToken = msg.player_token;
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
            if (!playerToken) throw new Error("Chưa kết nối vào phòng với tư cách đội chơi.");
            // httpUrl là API_URL (VITE_API_URL). Rỗng -> dùng same-origin (dev proxy).
            const apiBase = (httpUrl ?? "").replace(/\/+$/, "");
            const url = new URL(
                `${apiBase}/api/rooms/${encodeURIComponent(code)}/submissions`,
                window.location.href,
            );
            url.searchParams.set("filename", file.name);
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${playerToken}`,
                    "Content-Type": "application/octet-stream",
                },
                body: file,
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || result.error || `Lỗi ${res.status}`);
            return result;
        },
        close() {
            ws.onclose = null;
            ws.close();
            listeners.clear();
        },
    };
}
