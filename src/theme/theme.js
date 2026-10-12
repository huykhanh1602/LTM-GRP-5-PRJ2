// Khai báo hình ảnh/video thay cho emoji. Mục nào để trống thì giao diện dùng emoji.
// Đường dẫn bắt đầu bằng /theme/... nghĩa là file nằm ở public/theme/...
export const theme = {
  // Quân cờ: theo loại quân, rồi theo đội (phải trùng "type" và "owner" trong replay)
  pieces: {
    ROCK:     { team_a: "/theme/pieces/rock-a.png",     team_b: "/theme/pieces/rock-b.png" },
    PAPER:    { team_a: "/theme/pieces/paper-a.png",    team_b: "/theme/pieces/paper-b.png" },
    SCISSORS: { team_a: "/theme/pieces/scissors-a.png", team_b: "/theme/pieces/scissors-b.png" },
    // UNKNOWN:  { team_a: "/theme/pieces/unknown.png",    team_b: "/theme/pieces/unknown.png" },
  },

  // Ô đặc biệt trên bàn (khớp special_tiles.type)
  tiles: {
    BASE:     "/theme/tiles/base.png",
    OBSTACLE: "/theme/tiles/rock.png",
    TRAP:     "/theme/tiles/trap.png",
  },

  // Hiệu ứng khi có sự kiện (png/gif/webp/webm/mp4)
  effects: {
    combat: "/theme/fx/combat.png",
    trap:   "/theme/fx/trap.png",
    base:   "/theme/fx/win.png",
    reveal: "/theme/tiles/eye.png",
  },

  eventIcons: {
    REVEAL: "/theme/tiles/eye.png",
    COMBAT_RESOLVED: "/theme/fx/combat.png",
    TRAP_TRIGGERED: "/theme/fx/trap.png",
    BASE_CAPTURED: "/theme/fx/win.png",
    BOT_TIMEOUT: "/theme/fx/timeout.png",
    TURN_PASSED: "/theme/fx/skip.png",
    GAME_OVER: "/theme/fx/trophy.png",
  },

  // Dự phòng, hiện chưa dùng
  background: null,
};