const SPEEDS = [0.5, 1, 2, 4];

export default function Controls({ index, last, playing, speed, setSpeed, prev, next, seek, toggle }) {
  return (
    <div className="controls">
      <div className="controls-buttons">
        <button onClick={() => seek(0)} disabled={index === 0} title="Về đầu">⏮</button>
        <button onClick={prev} disabled={index === 0} title="Bước trước">◀</button>
        <button className="primary" onClick={toggle} title={playing ? "Tạm dừng" : "Phát"}>
          {playing ? "⏸ Dừng" : index >= last ? "↺ Phát lại" : "▶ Phát"}
        </button>
        <button onClick={next} disabled={index >= last} title="Bước sau">▶</button>
        <button onClick={() => seek(last)} disabled={index >= last} title="Về cuối">⏭</button>
        <label className="speed">
          Tốc độ
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </label>
      </div>
      <input
        className="slider"
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <div className="controls-count">Bước {index} / {last}</div>
    </div>
  );
}
