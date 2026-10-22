// Kiểm tra nhanh lớp chuẩn hoá dữ liệu Tournament Lobby.
// Chạy: node scripts/check-tournament-view.mjs
import {
  TOURNAMENT_FIXTURES,
  buildRoundRobinFixture,
  getTournamentFixture,
} from "../src/mock/tournamentLobby.mock.js";
import {
  mergeLiveUpdates,
  normalizeLiveMessage,
  normalizeTournament,
} from "../src/utils/tournamentView.js";

let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Single Elimination fixtures");
for (const key of Object.keys(TOURNAMENT_FIXTURES)) {
  const t = normalizeTournament(getTournamentFixture(key), {});
  console.log(
    `- ${key}: status=${t.status} format=${t.format} rounds=${t.rounds.length} labels=[${t.roundLabels.join(", ")}] entries=${t.entries.length}/${t.capacity} standings=${t.standings.length} feed=${t.feed.length}`,
  );
  check("status normalized", ["draft", "open", "in_progress", "completed"].includes(t.status));
  check("entryMap matches entries", t.entryMap.size === t.entries.length);
  if (key === "in_progress") {
    check("3 rounds rendered", t.rounds.length === 3);
    check("labels dynamic", t.roundLabels.join("|") === "Tứ kết|Bán kết|Chung kết");
    check("live slot kept", t.rounds[1][0].status === "running");
  }
}

console.log("\nRound Robin fixtures");
for (const key of ["open", "in_progress", "completed"]) {
  const fixture = getTournamentFixture(key);
  const playerCount = Math.min(fixture.registered, fixture.entries.length);
  const t = normalizeTournament(buildRoundRobinFixture(fixture), {});
  console.log(
    `- ${key}: status=${t.status} format=${t.format} players=${t.entries.length} rounds=${t.rounds.length} standings=${t.standings.length} feed=${t.feed.length} first=${t.roundLabels[0] ?? "—"}`,
  );
  check("format is round_robin", t.format === "round_robin");
  if (key !== "open") {
    check("round robin rounds = players - 1", t.rounds.length === playerCount - 1, String(t.rounds.length));
    check("round robin standings built", t.standings.length === playerCount, String(t.standings.length));
    check("round robin feed built", t.feed.length > 0, String(t.feed.length));
  }
}

console.log("\nWebSocket live patch");
const base = normalizeTournament(getTournamentFixture("in_progress"), {});
const message = {
  type: "slot_updated",
  payload: {
    slots: [
      {
        matchKey: "r1m0",
        status: "done",
        score: { a: 2, b: 1 },
        winnerId: "bot-alpha",
      },
    ],
  },
};
const parsed = normalizeLiveMessage(message);
const merged = mergeLiveUpdates(base.rounds, parsed?.updates ?? []);
check("live update parsed", parsed?.updates?.length === 1);
check("live status merged", merged[1][0].status === "done");
check("live score merged", merged[1][0].score?.a === 2 && merged[1][0].score?.b === 1);
check("other slots untouched", merged[0][0].status === "done" && merged[2][0].status === "pending");

const snapshotMessage = {
  type: "tournament_state",
  tournament: { id: "TOUR-X", name: "Live", status: "in_progress", bracket: { rounds: [] } },
};
check("snapshot parsed", normalizeLiveMessage(snapshotMessage)?.snapshot?.id === "TOUR-X");

console.log("\nBackend snake_case payload");
const raw = {
  id: "TOUR-API-1",
  name: "API Cup",
  status: "IN_PROGRESS",
  format: "SINGLE_ELIMINATION",
  game_id: "rps_chess",
  config: { maxParticipants: 4 },
  entries: [
    { user_id: "u1", display_name: "Alpha" },
    { user_id: "u2", display_name: "Beta" },
  ],
  bracket: {
    rounds: [
      [
        {
          match_key: "r0m0",
          participant_a_id: "u1",
          participant_b_id: "u2",
          status: "live",
          score_a: 1,
          score_b: 0,
        },
      ],
      [{ match_key: "r1m0", status: "pending" }],
    ],
  },
  standings: [{ user_id: "u1", played: 1, wins: 1, losses: 0, points: 3 }],
};
const api = normalizeTournament(raw, {});
console.log(
  `- status=${api.status} format=${api.format} rounds=${api.rounds.length} labels=[${api.roundLabels.join(", ")}] entries=${api.entries.map((e) => e.teamName).join(",")} score=${JSON.stringify(api.rounds[0][0].score)}`,
);
check("uppercase status normalized", api.status === "in_progress");
check("rounds normalized", api.rounds.length === 2);
check("snake_case slot mapped", api.rounds[0][0].participantAId === "u1");
check("snake_case score mapped", api.rounds[0][0].score?.a === 1);
check("entries normalized", api.entries[0].teamName === "Alpha");
check("standings normalized", api.standings[0].entryId === "u1");
check("capacity from config", api.capacity === 4, String(api.capacity));

console.log(failed === 0 ? "\nAll tournament view checks passed." : `\n${failed} check(s) failed.`);
process.exitCode = failed === 0 ? 0 : 1;
