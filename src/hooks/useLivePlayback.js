import { useCallback, useEffect, useState } from "react";

// Phát trận TRỰC TIẾP: frames tăng dần khi server gửi lượt mới.
// - Mặc định tự chạy theo, mỗi bước cách nhau STEP_MS (để người xem kịp thấy animation).
// - Người xem có thể dừng / tua lại; bấm "về cuối" (seek tới last) để bám theo trực tiếp lại.
const STEP_MS = 900;

export function useLivePlayback(frames, { followLive = false } = {}) {
  const last = frames.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Người cầm chuột xem chính nước của mình: nhảy thẳng tới khung mới nhất, không chờ bước đọc.
  useEffect(() => {
    if (followLive) setIndex(frames.length - 1);
  }, [followLive, frames.length]);

  useEffect(() => {
    if (!playing || index >= last) return;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, index, last, speed]);

  const next = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, last));
  }, [last]);
  const prev = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);
  const seek = useCallback(
    (i) => {
      const n = Math.max(0, Math.min(i, last));
      setIndex(n);
      setPlaying(n >= last); // tua về cuối = bám theo trực tiếp, tua chỗ khác = dừng
    },
    [last]
  );
  const toggle = useCallback(() => setPlaying((p) => !p), []);

  return {
    index,
    last,
    frame: frames[Math.min(index, last)],
    playing,
    speed,
    setSpeed,
    next,
    prev,
    seek,
    toggle,
    behind: last - index, // đang chậm bao nhiêu bước so với trực tiếp
  };
}
