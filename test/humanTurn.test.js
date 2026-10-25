import test from 'node:test';
import assert from 'node:assert/strict';

import { fallbackAction, maskHiddenInfo } from '../net/humanTurn.js';

const snakePayload = (over = {}) => ({
  board_state: { width: 6, height: 6 },
  my_pieces: [{ id: 'SEG_0', type: 'HEAD', pos: [3, 3] }],
  opponent_pieces: [{ id: 'OPP_0', type: 'HEAD', pos: [4, 3] }],
  ...over,
});

test('lượt người của Oẳn Tù Tì không lộ loại quân đối phương', () => {
  const payload = {
    board_state: { width: 8, height: 8, special_tiles: [] },
    my_pieces: [{ id: 'A1', type: 'ROCK', pos: [0, 0] }],
    opponent_pieces: [{ id: 'B1', type: 'PAPER', pos: [1, 1] }],
  };
  const masked = maskHiddenInfo('rps_chess', payload);
  assert.equal(masked.opponent_pieces[0].type, 'UNKNOWN');
  assert.deepEqual(masked.opponent_pieces[0].pos, [1, 1], 'vẫn phải thấy vị trí quân đối phương');
  assert.equal(masked.my_pieces[0].type, 'ROCK');
  assert.equal(payload.opponent_pieces[0].type, 'PAPER', 'payload gốc không bị sửa');

  const snake = maskHiddenInfo('snake_battle', snakePayload());
  assert.equal(snake.opponent_pieces[0].type, 'HEAD');
});

test('nước an toàn của rắn tránh tường, tránh thân và tránh đầu đối phương', () => {
  const action = fallbackAction('snake_battle', snakePayload({
    my_pieces: [
      { id: 'SEG_0', type: 'HEAD', pos: [2, 2] },
      { id: 'SEG_1', type: 'BODY', pos: [2, 3] },
      { id: 'SEG_2', type: 'BODY', pos: [2, 4] },
    ],
    opponent_pieces: [{ id: 'OPP_0', type: 'HEAD', pos: [3, 2] }],
  }));
  assert.equal(action.action_type, 'MOVE');
  // DOWN đâm vào thân, RIGHT đâm đầu đối phương, UP/LEFT còn trống và thoáng hơn.
  assert.ok(['UP', 'LEFT'].includes(action.direction), `hướng ${action.direction} không được đâm vào đâu`);
});

test('rắn dài vẫn tính ô đuôi là còn đi được', () => {
  const action = fallbackAction('snake_battle', snakePayload({
    my_pieces: [
      { id: 'SEG_0', type: 'HEAD', pos: [1, 1] },
      { id: 'SEG_1', type: 'BODY', pos: [1, 2] },
      { id: 'SEG_2', type: 'BODY', pos: [1, 3] },
    ],
    opponent_pieces: [],
  }));
  assert.ok(['UP', 'LEFT', 'RIGHT'].includes(action.direction), `hướng ${action.direction} không chặn lối thoát`);
});

test('nước an toàn của Oẳn Tù Tì là ô kề bên trống, không vướng chướng ngại vật', () => {
  const payload = {
    board_state: { width: 8, height: 8, special_tiles: [{ pos: [4, 3], type: 'OBSTACLE' }] },
    my_pieces: [
      { id: 'A1', type: 'ROCK', pos: [3, 3] },
      { id: 'A2', type: 'SCISSORS', pos: [4, 4] },
    ],
    opponent_pieces: [{ id: 'B1', type: 'UNKNOWN', pos: [5, 5] }],
  };
  const action = fallbackAction('rps_chess', payload);
  assert.equal(action.action_type, 'MOVE');
  const piece = payload.my_pieces.find((item) => item.id === action.piece_id);
  assert.ok(piece, 'phải đi một quân của mình');
  const [x, y] = action.to;
  assert.ok(x >= 0 && y >= 0 && x < 8 && y < 8, 'ô đích phải trong bàn');
  assert.ok(Math.abs(x - piece.pos[0]) <= 1 && Math.abs(y - piece.pos[1]) <= 1, 'chỉ đi một ô');
  assert.ok(!payload.my_pieces.some((item) => item.pos[0] === x && item.pos[1] === y), 'không đè quân nhà');
  assert.ok(!payload.board_state.special_tiles.some((tile) => tile.pos[0] === x && tile.pos[1] === y), 'không đi vào chướng ngại vật');
});

test('payload thiếu quân thì không bịa ra nước đi', () => {
  assert.equal(fallbackAction('snake_battle', { board_state: { width: 6, height: 6 }, my_pieces: [] }), null);
});
