import { toCell } from "../utils/coords.js";
import Piece from "./Piece.jsx";
import ClashEffect from "./ClashEffect.jsx";
import Media from "./Media.jsx";
import { computeSnakeLayout } from "../utils/snakeLayout.js";
import { theme } from "../theme/theme.js";

const TILE_ICONS = { BASE: "🏁", OBSTACLE: "🧱", TRAP: "🕳️" };

// Vẽ bàn cờ HOÀN TOÀN từ dữ liệu: kích thước, ô đặc biệt, quân cờ.
export default function Board({ board, frame, colorOf }) {
  const { width, height } = board;

  const tileAt = new Map();
  for (const t of board.special_tiles ?? []) {
    const c = toCell(t.pos, board);
    tileAt.set(`${c.x},${c.y}`, t);
  }

  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tileAt.get(`${x},${y}`);
      const isTrail =
        frame.trail &&
        [frame.trail.from, frame.trail.to].some((p) => {
          const c = toCell(p, board);
          return c.x === x && c.y === y;
        });
      const cls = ["cell", (x + y) % 2 ? "odd" : "even"];
      if (tile) cls.push(`tile-${String(tile.type).toLowerCase()}`);
      if (isTrail) cls.push("trail");
      cells.push(
        <div
          key={`${x},${y}`}
          className={cls.join(" ")}
          style={tile?.owner ? { "--team": colorOf(tile.owner) } : undefined}
          title={tile ? `${tile.type}${tile.owner ? " · " + tile.owner : ""}` : `[${x},${y}]`}
        >
          {tile && <Media className="tile-icon" src={theme.tiles[tile.type]} fallback={TILE_ICONS[tile.type] ?? "?"} />}
        </div>
      );
    }
  }

  const snakeLayout = computeSnakeLayout(frame.pieces, board);
  const flash = frame.flash?.pos ? toCell(frame.flash.pos, board) : null;

  return (
    <div
      className="board-frame"
      style={{
        "--w": width,
        "--h": height,
        aspectRatio: `${width} / ${height}`,
      }}
    >
      <div className="board" style={{ aspectRatio: `${width} / ${height}` }}>
        <div
          className="board-grid"
          style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, gridTemplateRows: `repeat(${height}, 1fr)` }}
        >
          {cells}
        </div>
        <div className="board-layer">
          {Object.values(frame.pieces).map((p) => (
            <Piece
              key={p.id}
              piece={p}
              cell={toCell(p.pos, board)}
              width={width}
              height={height}
              color={colorOf(p.owner)}
              isMover={frame.mover === p.id}
              snake={snakeLayout.get(p.id) ?? null}
            />
          ))}
          {flash && (
            <ClashEffect
              key={frame.index}
              kind={frame.flash.kind}
              cell={flash}
              width={width}
              height={height}
            />
          )}
        </div>
      </div>
    </div>
  );
}
