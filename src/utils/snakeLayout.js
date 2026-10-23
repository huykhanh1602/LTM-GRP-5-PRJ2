// Tính hình dạng từng đốt rắn từ danh sách quân của một khung hình.
// Chỉ đọc dữ liệu có sẵn (id dạng A_HEAD_0, A_BODY_1, ... và vị trí); không tự tính luật chơi.

import { toCell } from "./coords.js";

const SIDES = ["up", "right", "down", "left"];
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

function sideTo(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return "right";
  if (dx === -1 && dy === 0) return "left";
  if (dx === 0 && dy === 1) return "down";
  if (dx === 0 && dy === -1) return "up";
  return null; // hai đốt không liền kề (ví dụ vừa xuất hiện): không nối
}

function segmentIndex(piece) {
  const match = /_(\d+)$/.exec(piece.id);
  return match ? Number(match[1]) : 0;
}

export function isSnakePiece(piece) {
  return piece.type === "HEAD" || piece.type === "BODY";
}

// Trả về Map(id -> { role: "head" | "body" | "tail", links: Set<side>, facing })
export function computeSnakeLayout(pieces, board) {
  const byOwner = new Map();
  for (const piece of Object.values(pieces)) {
    if (!isSnakePiece(piece)) continue;
    if (!byOwner.has(piece.owner)) byOwner.set(piece.owner, []);
    byOwner.get(piece.owner).push(piece);
  }

  const layout = new Map();
  for (const segments of byOwner.values()) {
    segments.sort((a, b) => segmentIndex(a) - segmentIndex(b));
    const cells = segments.map((piece) => toCell(piece.pos, board));
    segments.forEach((piece, i) => {
      const links = new Set();
      if (i > 0) {
        const side = sideTo(cells[i], cells[i - 1]);
        if (side) links.add(side);
      }
      if (i < segments.length - 1) {
        const side = sideTo(cells[i], cells[i + 1]);
        if (side) links.add(side);
      }
      const role = i === 0 ? "head" : i === segments.length - 1 ? "tail" : "body";
      // Đầu nhìn về phía ngược với đốt đứng sau nó.
      let facing = "up";
      if (i === 0 && segments.length > 1) {
        const back = sideTo(cells[0], cells[1]);
        if (back) facing = OPPOSITE[back];
      }
      layout.set(piece.id, { role, links, facing });
    });
  }
  return layout;
}

export { SIDES };
