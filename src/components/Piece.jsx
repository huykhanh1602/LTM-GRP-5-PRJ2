import Media from "./Media.jsx";
import { theme } from "../theme/theme.js";
import SnakeSegment, { SnakeFood } from "./SnakeSegment.jsx";

const ICONS = {
  ROCK: "✊",
  PAPER: "✋",
  SCISSORS: "✌️",
  UNKNOWN: "❓",
  HEAD: "🐍",
  BODY: "🟢",
  FOOD: "🍎",
};

export function pieceIcon(type) {
  return ICONS[type] ?? String(type ?? "?").slice(0, 2).toUpperCase();
}

export default function Piece({ piece, cell, width, height, color, isMover, snake = null }) {
  const style = {
    width: `${100 / width}%`,
    height: `${100 / height}%`,
    transform: `translate(${cell.x * 100}%, ${cell.y * 100}%)`,
    zIndex: isMover ? 5 : 2,
    "--team": color,
  };
  // Game rắn: vẽ đốt rắn liền nhau và mồi, không dùng bong bóng + nhãn id của game cờ.
  if (piece.type === "FOOD" || (snake && (piece.type === "HEAD" || piece.type === "BODY"))) {
    return (
      <div className="piece snake-piece" data-owner={piece.owner} style={style}>
        {piece.type === "FOOD" ? <SnakeFood /> : <SnakeSegment piece={piece} layout={snake} />}
      </div>
    );
  }
  return (
    <div className="piece" style={style}>
      <div className={`piece-body ${piece.alive ? "" : "dead"}`} title={`${piece.id} · ${piece.type}`}>
        <Media className="piece-icon" src={theme.pieces[piece.type]?.[piece.owner]} fallback={pieceIcon(piece.type)} />
        <span className="piece-id">{piece.id}</span>
        {piece.hp > 1 && <span className="piece-hp">{piece.hp}</span>}
      </div>
    </div>
  );
}
