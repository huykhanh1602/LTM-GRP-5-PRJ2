// Màu theo thứ tự đội . Đổi màu đội: sửa ở đây.
export const PALETTE = ["#0284c7", "#e11d48", "#059669", "#d97706"];

export function makeColorOf(teamIds) {
  return (owner) => {
    const i = teamIds.indexOf(owner);
    return i >= 0 ? PALETTE[i % PALETTE.length] : "#6366f1";
  };
}
