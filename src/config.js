// Cấu hình nộp code. Khi nhóm chốt định dạng thì chỉ sửa ở đây.
export const SUBMIT = {
  accept: [".py"], // đuôi file cho phép (CHỜ HUY CHỐT)
  maxBytes: 100 * 1024, // dung lượng tối đa
};

// Mã phòng: bỏ các ký tự dễ nhầm (0/O, 1/I)
export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
