import { useSound } from "../hooks/useSound.js";

// Nút bật/tắt tiếng + thanh âm lượng nhỏ gọn cho topbar.
export default function SoundControl() {
  const { muted, volume, toggleMuted, setVolume } = useSound();
  const icon = muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
  return (
    <div
      className="sound-control"
      style={{ display: "flex", alignItems: "center", gap: "6px" }}
      title={muted ? "Bật tiếng" : "Tắt tiếng"}
    >
      <button
        type="button"
        className="quick-auth-btn"
        onClick={toggleMuted}
        aria-label={muted ? "Bật tiếng" : "Tắt tiếng"}
        aria-pressed={muted}
        style={{ padding: "7px 10px", fontSize: "15px", lineHeight: 1, background: "var(--c-blue-deep)" }}
      >
        {icon}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Âm lượng"
        className="sound-volume"
        style={{ width: "72px", accentColor: "var(--accent)" }}
      />
    </div>
  );
}
