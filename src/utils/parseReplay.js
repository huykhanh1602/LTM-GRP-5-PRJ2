import { inBounds } from "./coords.js";

// Đọc + kiểm tra file replay. Lỗi thì ném Error với thông báo tiếng Việt rõ ràng
// (thay vì để màn hình trắng).
export function parseReplay(input) {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (e) {
      throw new Error("File không phải JSON hợp lệ: " + e.message);
    }
  }

  const errors = [];
  const board = data?.game_config?.board;

  if (
    !board ||
    !Number.isInteger(board.width) ||
    !Number.isInteger(board.height) ||
    board.width < 1 ||
    board.height < 1
  ) {
    errors.push("Thiếu game_config.board.width / height (số nguyên dương).");
  }
  if (!Array.isArray(data?.initial_state)) {
    errors.push("Thiếu mảng initial_state.");
  }
  if (!Array.isArray(data?.turns)) {
    errors.push("Thiếu mảng turns.");
  }
  if (errors.length) throw new Error(errors.join("\n"));

  const ids = new Set();
  for (const p of data.initial_state) {
    if (!p.id) errors.push("Có quân trong initial_state không có id.");
    else if (ids.has(p.id)) errors.push(`Trùng id quân: ${p.id}`);
    ids.add(p.id);
    if (!inBounds(p.pos, board)) {
      errors.push(
        `Quân ${p.id} ở ô [${p.pos}] nằm ngoài bàn ${board.width}x${board.height}.`
      );
    }
  }
  for (const t of board.special_tiles ?? []) {
    if (!inBounds(t.pos, board)) {
      errors.push(`Ô đặc biệt ${t.type} ở [${t.pos}] nằm ngoài bàn.`);
    }
  }
  for (const turn of data.turns) {
    for (const ev of turn.events ?? []) {
      if (ev.type === "PIECE_MOVED") {
        if (!ids.has(ev.piece_id)) {
          errors.push(`Lượt ${turn.turn}: PIECE_MOVED với quân không tồn tại (${ev.piece_id}).`);
        }
        if (!inBounds(ev.to, board)) {
          errors.push(`Lượt ${turn.turn}: quân ${ev.piece_id} đi tới [${ev.to}] ngoài bàn.`);
        }
      }
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 8).join("\n"));

  // Chuẩn hóa: bảo đảm có match_info.teams
  const owners = [...new Set(data.initial_state.map((p) => p.owner))];
  const teams = { ...Object.fromEntries(owners.map((o) => [o, o])), ...(data.match_info?.teams ?? {}) };
  return {
    ...data,
    match_info: { ...(data.match_info ?? {}), teams },
  };
}
