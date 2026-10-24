// chuẩn hoá text để tìm nick gần đúng: bỏ dấu, bỏ hoa thường, gom khoảng trắng
export function normalizeSearchText(value) {
  // hạ chữ hoa trước: Đ không tách được dấu bằng NFD nên phải đổi thành đ rồi mới suy ra d.
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Mỗi từ trong truy vấn phải xuất hiện trong tên (không cần đúng thứ tự).
export function searchTermMatches(candidateName, normalizedTerm) {
  if (!normalizedTerm) return false;
  const haystack = normalizeSearchText(candidateName);
  return normalizedTerm.split(" ").every((word) => haystack.includes(word));
}
