import { useCallback, useEffect, useState } from "react";

// Quản lý chỉ số frame hiện tại + phát tự động.
export function useReplay(frames) {
  const last = frames.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Đổi replay -> về đầu
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [frames]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, index, speed, last]);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const seek = useCallback((i) => setIndex(Math.max(0, Math.min(i, last))), [last]);
  const toggle = useCallback(() => {
    if (index >= last) setIndex(0);
    setPlaying((p) => !p);
  }, [index, last]);

  return {
    index,
    last,
    frame: frames[index],
    playing,
    speed,
    setSpeed,
    next,
    prev,
    seek,
    toggle,
    pause: () => setPlaying(false),
  };
}
