const LABELS = {
  online: "Live · WebSocket",
  connecting: "Đang kết nối…",
  reconnecting: "Đang kết nối lại…",
  offline: "Mất kết nối · đang thử lại",
};

// Nhãn trạng thái kênh realtime của giải đấu
export default function LiveStatus({ connection = "disabled", lastMessageAt = null }) {
  if (!connection || connection === "disabled") return null;

  return (
    <span className={`tl-live-status tl-live-status--${connection}`}>
      <i className="tl-live-status__dot" aria-hidden="true" />
      {LABELS[connection] ?? connection}
      {lastMessageAt && connection === "online" && (
        <small className="tl-live-status__time">
          {new Date(lastMessageAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </small>
      )}
    </span>
  );
}
