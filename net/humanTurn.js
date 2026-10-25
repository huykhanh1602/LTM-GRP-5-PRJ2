// Nước đi dự phòng và thông tin cần ẩn khi người thật cầm chuột.

const SNAKE_DIRS = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const STEP_DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function cells(...lists) {
    const set = new Set();
    for (const list of lists) for (const piece of list ?? []) set.add(`${piece.pos[0]},${piece.pos[1]}`);
    return set;
}

// Bàn cờ Oẳn Tù Tì cho người chơi biết quân đối phương đứng đâu nhưng chưa lộ loại quân.
export function maskHiddenInfo(gameId, payload) {
    if (gameId !== "rps_chess" || !payload?.opponent_pieces) return payload;
    return {
        ...payload,
        opponent_pieces: payload.opponent_pieces.map((piece) => ({ ...piece, type: "UNKNOWN", hp: 1 })),
    };
}

function snakeFallback(payload) {
    const board = payload.board_state;
    const mine = payload.my_pieces;
    const theirs = payload.opponent_pieces ?? [];
    const [headX, headY] = mine[0].pos;
    // Đuôi sẽ dịch đi nên ô của nó không tính là chắn.
    const blocked = cells(mine.slice(1, -1)).union(cells(theirs));
    const opponentHead = theirs[0]?.pos ?? null;
    const legal = [];
    for (const [name, [dx, dy]] of Object.entries(SNAKE_DIRS)) {
        const x = headX + dx;
        const y = headY + dy;
        if (x < 0 || y < 0 || x >= board.width || y >= board.height) continue;
        if (blocked.has(`${x},${y}`)) continue;
        const free = Object.values(SNAKE_DIRS).filter(([ox, oy]) => {
            const nx = x + ox;
            const ny = y + oy;
            return nx >= 0 && ny >= 0 && nx < board.width && ny < board.height && !blocked.has(`${nx},${ny}`);
        }).length;
        const distance = opponentHead ? Math.abs(x - opponentHead[0]) + Math.abs(y - opponentHead[1]) : 0;
        legal.push({ name, free, distance });
    }
    if (legal.length === 0) return { action_type: "MOVE", direction: "UP" };
    legal.sort((a, b) => b.free - a.free || b.distance - a.distance);
    return { action_type: "MOVE", direction: legal[0].name };
}

function rpsFallback(payload) {
    const board = payload.board_state;
    const obstacles = cells((board.special_tiles ?? []).filter((tile) => tile.type === "OBSTACLE"));
    const friendly = cells(payload.my_pieces);
    const enemy = cells(payload.opponent_pieces ?? []);
    for (const piece of payload.my_pieces) {
        for (const [dx, dy] of STEP_DELTAS) {
            const x = piece.pos[0] + dx;
            const y = piece.pos[1] + dy;
            if (x < 0 || y < 0 || x >= board.width || y >= board.height) continue;
            if (obstacles.has(`${x},${y}`) || friendly.has(`${x},${y}`)) continue;
            // Ô trống an toàn hơn ô đang có quân đối phương (chưa lộ loại).
            if (!enemy.has(`${x},${y}`)) {
                return { action_type: "MOVE", piece_id: piece.id, to: [x, y] };
            }
        }
    }
    const first = payload.my_pieces[0];
    const [dx, dy] = STEP_DELTAS[0];
    return { action_type: "MOVE", piece_id: first.id, to: [first.pos[0] + dx, first.pos[1] + dy] };
}

// Hướng/quân an toàn nhất dùng khi người chơi hết giờ lượt.
export function fallbackAction(gameId, payload) {
    if (!payload?.board_state || !Array.isArray(payload.my_pieces) || payload.my_pieces.length === 0) return null;
    return gameId === "snake_battle" ? snakeFallback(payload) : rpsFallback(payload);
}
