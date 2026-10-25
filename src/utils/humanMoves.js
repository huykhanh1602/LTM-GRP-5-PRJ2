// Những ô bấm được khi người thật cầm chuột (theo đúng luật của engine).
// Trả tọa độ theo màn hình (dùng toCell) để khớp với ô mà Board vẽ.
import { toCell } from "./coords.js";

const SNAKE_DIRS = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEPS = [...ORTHO, [1, 1], [1, -1], [-1, 1], [-1, -1]];

const key = (x, y) => `${x},${y}`;

function occupied(pieces) {
  const set = new Set();
  for (const piece of pieces ?? []) set.add(key(piece.pos[0], piece.pos[1]));
  return set;
}

function inBounds(board, x, y) {
  return x >= 0 && y >= 0 && x < board.width && y < board.height;
}

// Ô trên màn hình tương ứng với một vị trí trong payload của engine.
const screen = (board, pos) => toCell(pos, board);

// Rắn: ô kề đầu, tránh thân mình (trừ ô đuôi sẽ dịch đi) và toàn thân đối phương.
function snakeTargets(payload) {
  const board = payload.board_state;
  const mine = payload.my_pieces ?? [];
  if (mine.length === 0) return [];
  const [headX, headY] = mine[0].pos;
  const blocked = new Set([...occupied(mine.slice(1, -1)), ...occupied(payload.opponent_pieces)]);
  const targets = [];
  for (const [direction, [dx, dy]] of Object.entries(SNAKE_DIRS)) {
    const x = headX + dx;
    const y = headY + dy;
    if (!inBounds(board, x, y) || blocked.has(key(x, y))) continue;
    const cell = screen(board, [x, y]);
    targets.push({ x: cell.x, y: cell.y, action: { action_type: "MOVE", direction } });
  }
  return targets;
}

// Oẳn Tù Tì: quân đã chọn đi một ô theo vua, không vào chướng ngại vật hoặc quân nhà.
function rpsTargets(payload, pieceId) {
  const board = payload.board_state;
  const piece = (payload.my_pieces ?? []).find((p) => p.id === pieceId);
  if (!piece) return [];
  const obstacles = occupied((board.special_tiles ?? []).filter((tile) => tile.type === "OBSTACLE"));
  const friendly = occupied(payload.my_pieces);
  const diagonal = payload.config?.rules?.allow_diagonal !== false;
  const targets = [];
  for (const [dx, dy] of STEPS) {
    if (!diagonal && dx !== 0 && dy !== 0) continue;
    const x = piece.pos[0] + dx;
    const y = piece.pos[1] + dy;
    if (!inBounds(board, x, y)) continue;
    if (obstacles.has(key(x, y)) || friendly.has(key(x, y))) continue;
    const cell = screen(board, [x, y]);
    // action.to vẫn theo tọa độ gốc của engine.
    targets.push({ x: cell.x, y: cell.y, action: { action_type: "MOVE", piece_id: piece.id, to: [x, y] } });
  }
  return targets;
}

// Quân còn nước đi (kèm ô đang đứng trên màn hình) để người chơi bấm chọn.
export function movablePieces(gameId, payload) {
  if (!payload?.board_state || !Array.isArray(payload.my_pieces)) return [];
  if (gameId === "snake_battle") return [];
  return payload.my_pieces
    .filter((piece) => rpsTargets(payload, piece.id).length > 0)
    .map((piece) => {
      const cell = screen(payload.board_state, piece.pos);
      return { id: piece.id, x: cell.x, y: cell.y };
    });
}

export function humanMoveTargets(gameId, payload, pieceId = null) {
  if (!payload?.board_state || !Array.isArray(payload.my_pieces)) return [];
  return gameId === "snake_battle" ? snakeTargets(payload) : rpsTargets(payload, pieceId);
}
