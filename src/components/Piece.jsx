// Bảng tra icon theo loại quân. Loại lạ (thầy thêm loại mới) -> hiện chữ cái đầu, không crash.
const ICONS = {
  ROCK: "✊",
  PAPER: "✋",
  SCISSORS: "✌️",
  UNKNOWN: "❓",
};

export function pieceIcon(type) {
  return ICONS[type] ?? String(type ?? "?").slice(0, 2).toUpperCase();
}

export default function Piece({ piece, cell, width, height, color, isMover }) {
  const style = {
    width: `${100 / width}%`,
    height: `${100 / height}%`,
    transform: `translate(${cell.x * 100}%, ${cell.y * 100}%)`,
    zIndex: isMover ? 5 : 2,
    "--team": color,
  };
  return (
    <div className="piece" style={style}>
      <div className={`piece-body ${piece.alive ? "" : "dead"}`} title={`${piece.id} · ${piece.type}`}>
        <span className="piece-icon">{pieceIcon(piece.type)}</span>
        <span className="piece-id">{piece.id}</span>
        {piece.hp > 1 && <span className="piece-hp">{piece.hp}</span>}
      </div>
    </div>
  );
}
