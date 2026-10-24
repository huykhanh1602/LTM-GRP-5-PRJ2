import test from 'node:test';
import assert from 'node:assert/strict';
import { snakeShapes, lerpPoints, easeInOut } from '../src/utils/snakeShape.js';

const board = { width: 16, height: 16, coordinate_system: 'TOP_LEFT_ORIGIN_X_RIGHT_Y_DOWN' };
const piece = (id, owner, type, pos, alive = true) => ({ id, owner, type, pos, alive });
const asMap = (list) => Object.fromEntries(list.map((p) => [p.id, p]));

test('mỗi đội một đường rắn, sắp xếp từ đầu đến đuôi theo số cuối của id, mồi bị bỏ qua', () => {
  const shapes = snakeShapes(asMap([
    piece('A_BODY_2', 'team_a', 'BODY', [3, 5]),
    piece('A_HEAD_0', 'team_a', 'HEAD', [3, 3]),
    piece('A_BODY_1', 'team_a', 'BODY', [3, 4]),
    piece('B_HEAD_0', 'team_b', 'HEAD', [9, 9]),
    piece('FOOD_1', 'neutral', 'FOOD', [5, 5]),
  ]), board);
  assert.equal(shapes.length, 2);
  const a = shapes.find((s) => s.owner === 'team_a');
  assert.deepEqual(a.points, [{ x: 3.5, y: 3.5 }, { x: 3.5, y: 4.5 }, { x: 3.5, y: 5.5 }]);
  assert.equal(shapes.find((s) => s.owner === 'team_b').points.length, 1);
});

test('rắn chết khi có đốt alive=false', () => {
  const [shape] = snakeShapes(asMap([
    piece('A_HEAD_0', 'team_a', 'HEAD', [1, 1], false),
    piece('A_BODY_1', 'team_a', 'BODY', [1, 2], false),
  ]), board);
  assert.equal(shape.alive, false);
});

test('nội suy giữ nguyên số điểm của hình đích: dài ra thì đuôi mới mọc từ đuôi cũ', () => {
  const from = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const to = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
  assert.deepEqual(lerpPoints(from, to, 0).map((p) => p.x), [0, 1, 1]);
  assert.deepEqual(lerpPoints(from, to, 1), to);
  assert.equal(lerpPoints(from, to, 0.5).length, 3);
});

test('nội suy giữa hai điểm liền kề luôn nằm trên đoạn nối: các đốt liên tiếp không bao giờ cách nhau quá một ô', () => {
  // Rắn rẽ góc: mọi điểm trung gian vẫn cách điểm kế tiếp nhiều nhất ~ một ô + sai số nhỏ
  const from = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 3 }];
  const to = [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }];
  for (let t = 0; t <= 1; t += 0.1) {
    const points = lerpPoints(from, to, easeInOut(t));
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= 1.0001);
    }
  }
});
