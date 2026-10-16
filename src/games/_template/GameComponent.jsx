// View của game mẫu. Nhận `session` (GameSession) từ GameHost của Platform.
// View KHÔNG tự tính luật: mọi thao tác đi qua plugin (session.plugin).
import { useEffect, useState } from "react";
import { remainingMs } from "./logic.js";
import "./styles.css";

export default function TapCounterView({ session }) {
    const plugin = session.plugin;
    const [state, setState] = useState(() => plugin.getState());
    const [now, setNow] = useState(() => Date.now());

    // Plugin phát thay đổi -> view vẽ lại.
    useEffect(() => plugin.subscribe(setState), [plugin]);

    // Đồng hồ: cập nhật thời gian còn lại và báo hết giờ.
    useEffect(() => {
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            plugin.syncClock(t);
        }, 100);
        return () => clearInterval(id);
    }, [plugin]);

    const finished = state.endedAt != null;
    const secondsLeft = (remainingMs(state, now) / 1000).toFixed(1);

    return (
        <div className="tap-counter">
            <p className="tc-hint">
                Bấm nút càng nhiều lần càng tốt trong {Math.round(state.durationMs / 1000)} giây.
            </p>
            <div className="tc-stats">
                <span>
                    Điểm: <strong>{state.taps}</strong>
                </span>
                <span>
                    Còn lại: <strong>{secondsLeft}s</strong>
                </span>
            </div>
            <button className="btn primary big" disabled={finished} onClick={() => plugin.tap()}>
                Bấm!
            </button>
            {finished && (
                <p className="tc-done">
                    Hết giờ! Điểm cuối: <strong>{state.taps}</strong>
                </p>
            )}
        </div>
    );
}
