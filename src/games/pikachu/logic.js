// ────────────────────────────────────────────────────────────
// Logic thuần cho game Pikachu Puzzle
// Không import React — có thể test bằng node --test
// ────────────────────────────────────────────────────────────

/** Bộ icon mặc định (80 icon) — đủ cho grid 12×12 (72 cặp) */
export const TILE_ICONS = Object.freeze([
  '⚡', '🔥', '💧', '🌿', '💎', '🌟', '🌙', '☀️',
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🍉',
  '🌸', '🌺', '🌻', '🌷', '🌹', '🍀', '🌵', '🌴',
  '🦋', '🐞', '🐝', '🐜', '🐛', '🐌', '🐢', '🐠',
  '🐱', '🐶', '🐰', '🐼', '🦊', '🐯', '🦁', '🐸',
  '🐲', '🦄', '🐧', '🦅', '🐻', '🐨', '🐮', '🐷',
  '🎯', '🎲', '🎨', '🎭', '🎪', '🎠', '🎡', '🎢',
  '🌈', '⭐', '🌠', '🎇', '🎆', '✨', '💫', '🌟',
  '❤️', '💛', '💚', '💙', '💜', '🧡', '🖤', '🤍',
  '🎀', '🎁', '🎈', '🎉', '🎊', '🎃', '🎄', '🎪',
]);

export const DEFAULTS = Object.freeze({
  gridSize: 12,
});

// ── Khởi tạo trạng thái game ───────────────────────────────

export function createGameState(options = {}) {
  const gridSize = options.gridSize ?? DEFAULTS.gridSize;
  // gridSize phải chẵn để có số cặp nguyên
  const size = gridSize % 2 === 0 ? gridSize : gridSize + 1;
  return {
    gridSize: size,
    grid: null,          // 2D array: 0 = empty, >0 = tile type ID
    moves: 0,
    startedAt: 0,
    endedAt: null,
    won: false,
    selected: null,      // { r, c } or null
    lastPath: null,      // [{ r, c }, ...] or null
    shuffled: false,     // vừa bị xáo bài?
    message: '',         // thông báo cho người chơi
  };
}

// ── Sinh grid ──────────────────────────────────────────────

export function generateGrid(gridSize) {
  const total = gridSize * gridSize;
  const pairs = total / 2;

  // Tạo mảng các cặp
  const tiles = [];
  for (let i = 0; i < pairs; i++) {
    const typeId = i + 1; // 1-based
    tiles.push(typeId, typeId);
  }

  // Xáo trộn Fisher-Yates
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // Đổ vào grid 2D
  const grid = [];
  let idx = 0;
  for (let r = 0; r < gridSize; r++) {
    const row = [];
    for (let c = 0; c < gridSize; c++) {
      row.push(tiles[idx++]);
    }
    grid.push(row);
  }

  return grid;
}

// ── Bắt đầu ván mới ────────────────────────────────────────

export function begin(state, now = Date.now()) {
  const grid = generateGrid(state.gridSize);
  return {
    ...state,
    grid,
    moves: 0,
    startedAt: now,
    endedAt: null,
    won: false,
    selected: null,
    lastPath: null,
    shuffled: false,
    message: '',
  };
}

// ── Pathfinding: tối đa 2 lần rẽ ──────────────────────────

/**
 * Tìm đường đi từ (r1, c1) đến (r2, c2) với tối đa 2 lần rẽ.
 * @returns {Array<{r:number,c:number}>|null} mảng toạ độ đường đi hoặc null
 */
export function findPath(grid, r1, c1, r2, c2) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Nếu cùng ô hoặc không cùng loại -> không hợp lệ
  if (r1 === r2 && c1 === c2) return null;
  if (grid[r1][c1] !== grid[r2][c2]) return null;
  if (grid[r1][c1] === 0) return null;

  // Extended grid có viền (viền luôn trống)
  const ER = rows + 2;
  const EC = cols + 2;

  // Chuyển sang toạ độ extended (1-based)
  const sr = r1 + 1, sc = c1 + 1;
  const er = r2 + 1, ec = c2 + 1;

  // Hướng: 0=phải, 1=xuống, 2=trái, 3=lên
  const dr = [0, 1, 0, -1];
  const dc = [1, 0, -1, 0];

  // visited[r][c][dir][turns]
  const visited = Array.from({ length: ER }, () =>
    Array.from({ length: EC }, () =>
      Array.from({ length: 4 }, () => [false, false, false])
    )
  );

  // Queue: { r, c, dir, turns, path }
  const queue = [];

  // Khởi tạo: từ ô start đi ra 4 hướng
  for (let d = 0; d < 4; d++) {
    const nr = sr + dr[d];
    const nc = sc + dc[d];

    if (nr < 0 || nr >= ER || nc < 0 || nc >= EC) continue;

    const isEnd = (nr === er && nc === ec);
    // Ô kế tiếp phải là ô trống hoặc ô đích
    if (!isCellPassable(grid, nr, nc, er, ec, isEnd)) continue;

    visited[nr][nc][d][0] = true;
    queue.push({ r: nr, c: nc, dir: d, turns: 0, path: [{ r: r1, c: c1 }] });
  }

  let head = 0;
  while (head < queue.length) {
    const { r, c, dir, turns, path } = queue[head++];

    // Đã tới đích?
    if (r === er && c === ec) {
      return [...path, { r: r2, c: c2 }];
    }

    // Thử 4 hướng
    for (let nd = 0; nd < 4; nd++) {
      const nr = r + dr[nd];
      const nc = c + dc[nd];

      if (nr < 0 || nr >= ER || nc < 0 || nc >= EC) continue;

      const isEnd = (nr === er && nc === ec);
      if (!isCellPassable(grid, nr, nc, er, ec, isEnd)) continue;

      const newTurns = (nd === dir) ? turns : turns + 1;
      if (newTurns > 2) continue;

      if (visited[nr][nc][nd][newTurns]) continue;
      visited[nr][nc][nd][newTurns] = true;

      queue.push({
        r: nr, c: nc, dir: nd, turns: newTurns,
        path: [...path, { r: nr - 1, c: nc - 1 }],
      });
    }
  }

  return null; // Không tìm thấy đường
}

/** Kiểm tra ô có thể đi qua không (trong extended grid) */
function isCellPassable(grid, r, c, er, ec, isEnd) {
  if (isEnd) return true;
  // Viền ngoài (hàng 0, hàng cuối, cột 0, cột cuối) luôn trống
  if (r === 0 || r === grid.length + 1 || c === 0 || c === grid[0].length + 1) {
    return true;
  }
  // Ô bên trong phải là 0 (đã xoá)
  return grid[r - 1][c - 1] === 0;
}

// ── Kiểm tra nước đi ───────────────────────────────────────

export function tryMatch(state, r1, c1, r2, c2) {
  const grid = state.grid;
  if (!grid) return { ...state, message: 'Chưa bắt đầu game!' };

  if (r1 === r2 && c1 === c2) {
    return { ...state, selected: null, message: 'Hãy chọn 2 ô khác nhau!' };
  }

  if (grid[r1][c1] === 0 || grid[r2][c2] === 0) {
    return { ...state, selected: null, message: 'Ô này đã được xoá!' };
  }

  if (grid[r1][c1] !== grid[r2][c2]) {
    return { ...state, selected: null, message: '2 ô không cùng loại!' };
  }

  const path = findPath(grid, r1, c1, r2, c2);
  if (!path) {
    return { ...state, selected: null, message: 'Không thể nối! Đường đi tối đa 2 lần rẽ.' };
  }

  // Xoá 2 ô
  const newGrid = grid.map(row => [...row]);
  newGrid[r1][c1] = 0;
  newGrid[r2][c2] = 0;

  const newState = {
    ...state,
    grid: newGrid,
    moves: state.moves + 1,
    selected: null,
    lastPath: path,
    message: '',
    shuffled: false,
  };

  // Kiểm tra thắng cuộc
  if (isAllCleared(newGrid)) {
    return { ...newState, won: true, endedAt: Date.now(), message: '🎉 Bạn đã thắng!' };
  }

  // Kiểm tra còn nước đi không
  if (!hasAnyValidMove(newGrid)) {
    newState.message = '⚠️ Không còn nước đi! Đang xáo bài...';
    newState.shuffled = true;
  }

  return newState;
}

// ── Kiểm tra hết ô ─────────────────────────────────────────

export function isAllCleared(grid) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== 0) return false;
    }
  }
  return true;
}

// ── Kiểm tra còn nước đi hợp lệ ────────────────────────────

export function hasAnyValidMove(grid) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Gom các ô theo loại
  const byType = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = grid[r][c];
      if (type !== 0) {
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push({ r, c });
      }
    }
  }

  // Kiểm tra từng cặp cùng loại
  for (const [, cells] of byType) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (findPath(grid, cells[i].r, cells[i].c, cells[j].r, cells[j].c)) {
          return true;
        }
      }
    }
  }

  return false;
}

// ── Xáo bài ────────────────────────────────────────────────

export function shuffleGrid(grid) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Thu thập các ô còn lại
  const tiles = [];
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 0) {
        tiles.push(grid[r][c]);
        positions.push({ r, c });
      }
    }
  }

  // Xáo trộn mảng tiles
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // Đặt lại vào grid
  const newGrid = grid.map(row => [...row]);
  for (let i = 0; i < positions.length; i++) {
    newGrid[positions[i].r][positions[i].c] = tiles[i];
  }

  // Nếu xáo xong vẫn không có nước đi thì xáo lại (đệ quy)
  if (!hasAnyValidMove(newGrid) && tiles.length > 0) {
    return shuffleGrid(newGrid);
  }

  return newGrid;
}

// ── Chọn ô ─────────────────────────────────────────────────

export function selectTile(state, r, c) {
  if (!state.grid || state.won || state.endedAt) return state;
  if (state.grid[r][c] === 0) return { ...state, message: 'Ô này đã được xoá!' };

  // Nếu chưa chọn ô nào -> chọn
  if (!state.selected) {
    return { ...state, selected: { r, c }, message: '' };
  }

  // Nếu chọn lại ô đang chọn -> bỏ chọn
  if (state.selected.r === r && state.selected.c === c) {
    return { ...state, selected: null, message: '' };
  }

  // Đã có ô chọn -> thử ghép
  return tryMatch(state, state.selected.r, state.selected.c, r, c);
}

// ── Xáo bài từ UI ──────────────────────────────────────────

export function manualShuffle(state) {
  if (!state.grid || state.won || state.endedAt) return state;
  const newGrid = shuffleGrid(state.grid);
  return {
    ...state,
    grid: newGrid,
    selected: null,
    lastPath: null,
    shuffled: true,
    message: '🔄 Đã xáo bài!',
  };
}

// ── Thời gian ──────────────────────────────────────────────

export function elapsedMs(state, now = Date.now()) {
  if (!state.startedAt) return 0;
  return (state.endedAt ?? now) - state.startedAt;
}

export function isFinished(state) {
  return state.won || state.endedAt != null;
}

export function remainingPairs(state) {
  if (!state.grid) return 0;
  let count = 0;
  for (const row of state.grid) {
    for (const cell of row) {
      if (cell !== 0) count++;
    }
  }
  return count / 2;
}

/** Lấy icon cho tile type ID */
export function getTileIcon(typeId) {
  if (typeId <= 0 || typeId > TILE_ICONS.length) return '?';
  return TILE_ICONS[(typeId - 1) % TILE_ICONS.length];
}