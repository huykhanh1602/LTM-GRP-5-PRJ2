const EFFECTS = {
  combat: "💥",
  trap: "☠️",
  base: "🎉",
  reveal: "👁️",
};

// key={frame.index} ở chỗ gọi để animation chạy lại mỗi bước.
export default function ClashEffect({ kind, cell, width, height }) {
  const style = {
    width: `${100 / width}%`,
    height: `${100 / height}%`,
    transform: `translate(${cell.x * 100}%, ${cell.y * 100}%)`,
  };
  return (
    <div className="effect" style={style}>
      <div className={`effect-body effect-${kind}`}>{EFFECTS[kind] ?? "✨"}</div>
    </div>
  );
}
