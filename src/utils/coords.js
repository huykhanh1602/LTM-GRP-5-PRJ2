// Chỗ DUY NHẤT quy định cách đổi tọa độ trong replay -> ô trên màn hình.
// Nếu engine đổi hệ tọa độ, chỉ cần sửa file này.
//
// Mặc định (và khi coordinate_system = "TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN"):
//   pos = [x, y], gốc ở góc trên-trái, x sang phải, y đi xuống.
export function toCell(pos, board) {
  const sys = String(board.coordinate_system || "").toUpperCase();
  let [a, b] = pos;
  if (sys.includes("ROW_COL")) [a, b] = [b, a]; // pos = [hàng, cột]
  const flipY = sys.includes("BOTTOM");
  return { x: a, y: flipY ? board.height - 1 - b : b };
}

export function inBounds(pos, board) {
  return (
    Array.isArray(pos) &&
    pos.length === 2 &&
    Number.isInteger(pos[0]) &&
    Number.isInteger(pos[1]) &&
    pos[0] >= 0 &&
    pos[1] >= 0 &&
    pos[0] < board.width &&
    pos[1] < board.height
  );
}
