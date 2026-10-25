import test from "node:test";
import assert from "node:assert/strict";
import { humanMoveTargets, movablePieces } from "../src/utils/humanMoves.js";

const ids = (gameId, payload) => movablePieces(gameId, payload).map((p) => p.id);

const SNAKE_PAYLOAD = {
  board_state: { width: 6, height: 6, turn: 3 },
  my_pieces: [
    { id: "SEG_0", type: "HEAD", pos: [2, 2] },
    { id: "SEG_1", type: "BODY", pos: [2, 3] },
    { id: "SEG_2", type: "BODY", pos: [2, 4] },
  ],
  opponent_pieces: [{ id: "OPP_0", type: "HEAD", pos: [3, 2] }],
  config: {},
};

const snakeCells = (payload, pieceId) =>
  humanMoveTargets("snake_battle", payload, pieceId).map((t) => `${t.x},${t.y}:${t.action.direction}`);

test("rắn: chỉ tô ô kề đầu hợp lệ, tránh tường, thân mình và đầu đối phương", () => {
  assert.deepEqual(snakeCells(SNAKE_PAYLOAD).sort(), ["1,2:LEFT", "2,1:UP"]);
  assert.deepEqual(ids("snake_battle", SNAKE_PAYLOAD), []);
});

test("rắn: ô đang là đuôi thì vẫn bấm được vì đuôi sẽ dịch đi", () => {
  const payload = {
    ...SNAKE_PAYLOAD,
    my_pieces: [
      { id: "SEG_0", type: "HEAD", pos: [2, 2] },
      { id: "SEG_1", type: "BODY", pos: [3, 2] },
      { id: "SEG_2", type: "BODY", pos: [3, 3] },
      { id: "SEG_3", type: "BODY", pos: [2, 3] },
    ],
    opponent_pieces: [],
  };
  assert.deepEqual(snakeCells(payload, null).sort(), ["1,2:LEFT", "2,1:UP", "2,3:DOWN"]);
});

test("rắn: bí hết nước thì không tô ô nào", () => {
  const payload = {
    ...SNAKE_PAYLOAD,
    board_state: { width: 2, height: 2 },
    my_pieces: [{ id: "SEG_0", type: "HEAD", pos: [0, 0] }],
    opponent_pieces: [{ id: "OPP_0", type: "HEAD", pos: [1, 0] }, { id: "OPP_1", type: "BODY", pos: [0, 1] }],
  };
  assert.deepEqual(humanMoveTargets("snake_battle", payload), []);
});

const RPS_BOARD = {
  width: 4,
  height: 4,
  special_tiles: [{ type: "OBSTACLE", pos: [1, 1] }, { type: "BASE", pos: [0, 0], owner: "team_a" }],
};
const rpsPayload = (extra = {}) => ({
  board_state: RPS_BOARD,
  my_pieces: [
    { id: "A1", type: "ROCK", pos: [0, 1] },
    { id: "A2", type: "PAPER", pos: [2, 2] },
  ],
  opponent_pieces: [{ id: "B1", type: "UNKNOWN", pos: [3, 3] }],
  config: { rules: { allow_diagonal: true } },
  ...extra,
});
const rpsCells = (payload, pieceId) =>
  humanMoveTargets("rps_chess", payload, pieceId).map((t) => `${t.x},${t.y}:${t.action.piece_id}`);

test("oẳn tù tì: chưa chọn quân thì chưa có ô đích, quân đi được vẫn liệt kê", () => {
  const payload = rpsPayload();
  assert.deepEqual(humanMoveTargets("rps_chess", payload, null), []);
  assert.deepEqual(ids("rps_chess", payload), ["A1", "A2"]);
});

test("oẳn tù tì: ô đích kề bên, không vào chướng ngại vật hay quân nhà", () => {
  assert.deepEqual(rpsCells(rpsPayload(), "A1").sort(), ["0,0:A1", "0,2:A1", "1,0:A1", "1,2:A1"]);
});

test("oẳn tù tì: được đi vào ô có quân đối phương (đánh nhau)", () => {
  const cells = rpsCells(rpsPayload(), "A2");
  assert.ok(cells.includes("3,3:A2"));
  assert.ok(cells.includes("2,3:A2"));
});

test("oẳn tù tì: tắt chéo thì chỉ còn 4 hướng", () => {
  const payload = rpsPayload({ config: { rules: { allow_diagonal: false } } });
  assert.deepEqual(rpsCells(payload, "A1").sort(), ["0,0:A1", "0,2:A1"]);
});

test("oẳn tù tì: quân bị vây kín không hiện trong danh sách chọn", () => {
  const payload = rpsPayload({
    my_pieces: [
      { id: "A1", type: "ROCK", pos: [0, 0] },
      { id: "A2", type: "PAPER", pos: [1, 0] },
      { id: "A3", type: "SCISSORS", pos: [0, 1] },
    ],
  });
  assert.deepEqual(ids("rps_chess", payload), ["A2", "A3"]);
});

test("oẳn tù tì: trả cả vị trí trên màn hình của quân để bấm chọn", () => {
  assert.deepEqual(movablePieces("rps_chess", rpsPayload()), [
    { id: "A1", x: 0, y: 1 },
    { id: "A2", x: 2, y: 2 },
  ]);
});

test("payload thiếu quân thì coi như không bấm được ô nào", () => {
  assert.deepEqual(humanMoveTargets("rps_chess", { board_state: RPS_BOARD, my_pieces: [] }, "A1"), []);
  assert.deepEqual(humanMoveTargets("snake_battle", null), []);
});
