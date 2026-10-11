import { REASON_LABELS, teamName } from "../utils/replayEngine.js";

// Hiện cảnh báo (timeout...) và kết quả cuối ván.
// Có khung giữ chỗ cố định để bàn cờ và nút điều khiển không bị nhảy khi banner xuất hiện.
export default function ResultBanner({ replay, frame }) {
  const { over, notice } = frame;
  return (
    <div className="banner-slot">
      {notice && (
        <div className="banner warn">
          ⏱️ {teamName(replay, notice.team)} quá thời gian suy nghĩ, bị bỏ qua lượt này.
        </div>
      )}
      {over && (
        <div className="banner win">
          🏆 <b>{over.winner ? teamName(replay, over.winner) : "Hòa"}</b>
          {over.winner ? " thắng" : ""}
          {over.reason ? ` — ${REASON_LABELS[over.reason] ?? over.reason}` : ""}
        </div>
      )}
    </div>
  );
}
