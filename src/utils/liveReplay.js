import { parseReplay } from "./parseReplay.js";

export function createLiveReplay(matchStart) {
  const replay = parseReplay({ ...matchStart, turns: [] });
  return {
    ...replay,
    match_info: {
      ...replay.match_info,
      winner: null,
      win_reason: null,
      total_turns: 0,
    },
  };
}

export function appendLiveReplayTurn(replay, turn) {
  return {
    ...replay,
    turns: [...replay.turns, turn],
    match_info: {
      ...replay.match_info,
      total_turns: replay.turns.length + 1,
    },
  };
}

export function finishLiveReplay(replay, result) {
  if (!replay) return null;
  return {
    ...replay,
    match_info: {
      ...replay.match_info,
      winner: result.winner ?? null,
      win_reason: result.reason ?? null,
      total_turns: replay.turns.length,
    },
  };
}
