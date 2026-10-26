// Biến các quân HEAD/BODY của một khung hình thành "hình dạng" từng con rắn:
// danh sách tâm ô nối từ đầu đến đuôi. Giao diện vẽ cả con rắn thành MỘT đường liền
// (SVG) nên không còn khe hở giữa các đốt, kể cả khi đang chuyển động.
// Chỉ đọc dữ liệu có sẵn (id dạng A_HEAD_0, A_BODY_1... và vị trí); không tự tính luật chơi.

import { toCell } from "./coords.js";

export function isSnakePiece(piece) {
  return piece.type === "HEAD" || piece.type === "BODY";
}

function segmentIndex(piece) {
  const match = /_(\d+)$/.exec(piece.id);
  return match ? Number(match[1]) : 0;
}

// Trả về [{ owner, alive, points: [{x, y}, ...] }], điểm 0 là đầu; toạ độ tính theo ô, tâm ô = (x + 0.5, y + 0.5).
export function snakeShapes(pieces, board) {
  const byOwner = new Map();
  for (const piece of Object.values(pieces)) {
    if (!isSnakePiece(piece)) continue;
    if (!byOwner.has(piece.owner)) byOwner.set(piece.owner, []);
    byOwner.get(piece.owner).push(piece);
  }
  return [...byOwner.entries()].map(([owner, segments]) => {
    segments.sort((a, b) => segmentIndex(a) - segmentIndex(b));
    return {
      owner,
      alive: segments.every((piece) => piece.alive !== false),
      points: segments.map((piece) => {
        const cell = toCell(piece.pos, board);
        return { x: cell.x + 0.5, y: cell.y + 0.5 };
      }),
    };
  });
}

// Nội suy từng điểm giữa hai hình dạng của cùng một con rắn (t từ 0 đến 1).
// Rắn dài ra thì phần đuôi mới "mọc" ra từ đuôi cũ; ngắn lại thì bỏ bớt điểm thừa.
export function lerpPoints(from, to, t) {
  if (!from.length) return to;
  return to.map((target, i) => {
    const start = from[Math.min(i, from.length - 1)];
    return { x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t };
  });
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
