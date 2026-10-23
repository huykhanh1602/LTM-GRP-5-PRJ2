import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSnakeLayout } from '../src/utils/snakeLayout.js';

const board = { width: 16, height: 16, coordinate_system: 'TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN' };
const piece = (id, owner, type, pos) => ({ id, owner, type, pos, alive: true });

test('đầu nhìn ngược hướng đốt sau; đốt đầu/thân/đuôi có vai trò và nối đúng', () => {
  // Rắn đi lên: đầu (3,3), thân (3,4), đuôi (3,5)
  const pieces = Object.fromEntries([
    piece('A_HEAD_0', 'team_a', 'HEAD', [3, 3]),
    piece('A_BODY_1', 'team_a', 'BODY', [3, 4]),
    piece('A_BODY_2', 'team_a', 'BODY', [3, 5]),
  ].map((p) => [p.id, p]));
  const layout = computeSnakeLayout(pieces, board);
  assert.equal(layout.get('A_HEAD_0').role, 'head');
  assert.equal(layout.get('A_HEAD_0').facing, 'up');
  assert.deepEqual([...layout.get('A_HEAD_0').links], ['down']);
  assert.equal(layout.get('A_BODY_1').role, 'body');
  assert.deepEqual([...layout.get('A_BODY_1').links].sort(), ['down', 'up']);
  assert.equal(layout.get('A_BODY_2').role, 'tail');
  assert.deepEqual([...layout.get('A_BODY_2').links], ['up']);
});

test('khúc cua nối hai cạnh vuông góc, đầu nhìn sang phải khi đốt sau ở bên trái', () => {
  const pieces = Object.fromEntries([
    piece('B_HEAD_0', 'team_b', 'HEAD', [5, 4]),
    piece('B_BODY_1', 'team_b', 'BODY', [4, 4]),
    piece('B_BODY_2', 'team_b', 'BODY', [4, 5]),
  ].map((p) => [p.id, p]));
  const layout = computeSnakeLayout(pieces, board);
  assert.equal(layout.get('B_HEAD_0').facing, 'right');
  assert.deepEqual([...layout.get('B_BODY_1').links].sort(), ['down', 'right']);
});

test('hai con rắn và mồi không lẫn nhau; mồi không có layout', () => {
  const pieces = Object.fromEntries([
    piece('A_HEAD_0', 'team_a', 'HEAD', [1, 1]),
    piece('B_HEAD_0', 'team_b', 'HEAD', [9, 9]),
    piece('FOOD_1', 'neutral', 'FOOD', [5, 5]),
  ].map((p) => [p.id, p]));
  const layout = computeSnakeLayout(pieces, board);
  assert.equal(layout.has('FOOD_1'), false);
  assert.equal(layout.get('A_HEAD_0').role, 'head');
  assert.equal(layout.get('B_HEAD_0').role, 'head');
});
