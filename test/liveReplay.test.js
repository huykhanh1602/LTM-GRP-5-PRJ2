import test from "node:test";
import assert from "node:assert/strict";
import {
  appendLiveReplayTurn,
  createLiveReplay,
  finishLiveReplay,
} from "../src/utils/liveReplay.js";
import { buildFrames } from "../src/utils/replayEngine.js";

test("a completed live match produces a replay from the exact streamed turns", () => {
  const replayStart = {
    type: "match_start",
    match_info: {
      match_id: "M-LIVE",
      teams: { team_a: "Alpha", team_b: "Beta" },
    },
    game_config: {
      board: { width: 4, height: 4, special_tiles: [] },
      rules: {},
    },
    initial_state: [
      { id: "A1", owner: "team_a", type: "ROCK", pos: [0, 0], hp: 1 },
      { id: "B1", owner: "team_b", type: "SCISSORS", pos: [2, 0], hp: 1 },
    ],
  };
  const firstTurn = {
    turn: 1,
    player: "team_a",
    actions: [{ piece_id: "A1", action_type: "MOVE", from: [0, 0], to: [1, 0] }],
    events: [{ type: "PIECE_MOVED", piece_id: "A1", from: [0, 0], to: [1, 0] }],
  };
  const secondTurn = {
    turn: 2,
    player: "team_b",
    actions: [{ piece_id: "B1", action_type: "MOVE", from: [2, 0], to: [1, 0] }],
    events: [
      { type: "PIECE_MOVED", piece_id: "B1", from: [2, 0], to: [1, 0] },
      {
        type: "COMBAT_RESOLVED",
        attacker_id: "B1",
        defender_id: "A1",
        location: [1, 0],
        winner_id: "A1",
        destroyed_pieces: ["B1"],
        damaged_pieces: [],
      },
      { type: "GAME_OVER", winner_team: "team_a", reason: "ALL_PIECES_CAPTURED" },
    ],
  };

  let replay = createLiveReplay(replayStart);
  replay = appendLiveReplayTurn(replay, firstTurn);
  replay = appendLiveReplayTurn(replay, secondTurn);
  replay = finishLiveReplay(replay, { winner: "team_a", reason: "ALL_PIECES_CAPTURED" });

  assert.deepEqual(replay.turns, [firstTurn, secondTurn]);
  assert.equal(replay.match_info.total_turns, 2);
  assert.equal(replay.match_info.winner, "team_a");

  const frames = buildFrames(replay);
  const finalFrame = frames.at(-1);
  assert.deepEqual(finalFrame.pieces.A1.pos, [1, 0]);
  assert.equal(finalFrame.pieces.A1.alive, true);
  assert.deepEqual(finalFrame.pieces.B1.pos, [1, 0]);
  assert.equal(finalFrame.pieces.B1.alive, false);
  assert.deepEqual(finalFrame.over, { winner: "team_a", reason: "ALL_PIECES_CAPTURED" });
});
