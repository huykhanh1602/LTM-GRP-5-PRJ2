// Nhãn hiển thị và class tương ứng cho từng trạng thái giải đấu
export const STATUS_BADGE = {
  draft: { className: "upcoming", label: "Bản nháp" },
  open: { className: "upcoming", label: "Sắp diễn ra" },
  in_progress: { className: "ongoing", label: "Đang diễn ra" },
  completed: { className: "completed", label: "Đã kết thúc" },
  cancelled: { className: "completed", label: "Đã hủy" },
};

// Nhãn trạng thái giải đấu dùng trên Trang cá nhân
export const TOUR_STATUS = {
  draft: { className: "upcoming", label: "Bản nháp" },
  open: { className: "upcoming", label: "Sắp khởi tranh" },
  in_progress: { className: "active", label: "Đang diễn ra" },
  completed: { className: "completed", label: "Đã kết thúc" },
  cancelled: { className: "completed", label: "Đã hủy" },
};