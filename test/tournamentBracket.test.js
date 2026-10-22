import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";

function playMatch(store, winnerId, loserId) {
  const match = store.startMatch({
    roomId: "cup-room", mode: "tournament", ranked: false, initialState: [],
    teamA: { id: winnerId, name: winnerId }, teamB: { id: loserId, name: loserId },
  });
  store.finishMatch(match.id, { winner: winnerId, reason: "BASE_CAPTURED" }, []);
  return match.id;
}

test("bracket loại trực tiếp đi hết vòng và tìm ra quán quân từ trận đấu thật", () => {
  const store = createMatchStore({ filename: ":memory:" });
  try {
    for (const [index, id] of ["alice", "bob", "carol", "dave"].entries()) {
      store.upsertUser({ id, display_name: `Người ${index + 1}` });
    }
    const tournament = store.createTournament({
      gameId: "rps_chess", code: "CUP-4", name: "Cup 4 đội", format: "single_elimination",
      config: { organizerId: "alice", rules: ["Bo1"], languages: ["python"] },
    });
    assert.equal(tournament.status, "open");
    assert.throws(() => store.generateTournamentBracket(tournament.id), /ít nhất 2 người/);

    for (const id of ["alice", "bob", "carol", "dave"]) store.addTournamentEntry(tournament.id, { userId: id });
    assert.throws(() => store.addTournamentEntry(tournament.id, { userId: "alice" }), /already joined/);

    const started = store.generateTournamentBracket(tournament.id);
    assert.equal(started.status, "in_progress");
    assert.equal(started.bracket.totalRounds, 2);
    assert.deepEqual(
      started.bracket.rounds[0].map((slot) => [slot.participantAId, slot.participantBId, slot.status]),
      [["alice", "dave", "ready"], ["bob", "carol", "ready"]],
    );
    assert.throws(() => store.generateTournamentBracket(tournament.id), /đã được tạo/);

    // Kết quả phải lấy từ trận đấu thật, không nhận trận của cặp đấu thủ khác.
    const unrelated = playMatch(store, "alice", "bob");
    assert.throws(
      () => store.attachSlotResult(tournament.id, { roundNo: 1, slotIndex: 0, matchId: unrelated }),
      /không diễn ra giữa hai đấu thủ/,
    );

    const semiA = playMatch(store, "alice", "dave");
    const afterSemiA = store.attachSlotResult(tournament.id, { roundNo: 1, slotIndex: 0, matchId: semiA });
    assert.equal(afterSemiA.bracket.rounds[0][0].winnerId, "alice");
    assert.equal(afterSemiA.bracket.rounds[0][0].matchId, semiA);
    assert.equal(afterSemiA.bracket.rounds[1][0].participantAId, "alice");
    assert.equal(afterSemiA.bracket.rounds[1][0].participantBId, null);
    assert.equal(afterSemiA.bracket.rounds[1][0].status, "pending");
    assert.equal(afterSemiA.status, "in_progress");

    const semiB = playMatch(store, "bob", "carol");
    const afterSemiB = store.attachSlotResult(tournament.id, { roundNo: 1, slotIndex: 1, matchId: semiB });
    assert.deepEqual(
      afterSemiB.bracket.rounds[1][0].participantAId,
      "alice",
    );
    assert.equal(afterSemiB.bracket.rounds[1][0].participantBId, "bob");
    assert.equal(afterSemiB.bracket.rounds[1][0].status, "ready");

    const final = playMatch(store, "bob", "alice");
    const completed = store.attachSlotResult(tournament.id, { roundNo: 2, slotIndex: 0, matchId: final });
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.champion, { id: "bob", name: "Người 2" });
    assert.equal(completed.bracket.rounds[1][0].winnerId, "bob");
    assert.throws(
      () => store.attachSlotResult(tournament.id, { roundNo: 1, slotIndex: 0, matchId: semiA }),
      /đang diễn ra/,
    );
  } finally { store.close(); }
});

test("số đấu thủ không phải lũy thừa 2 thì hạt số 1 được bye và đi tiếp", () => {
  const store = createMatchStore({ filename: ":memory:" });
  try {
    for (const id of ["ann", "ben", "cio"]) store.upsertUser({ id, display_name: id });
    const tournament = store.createTournament({
      gameId: "rps_chess", code: "CUP-3", name: "Cup 3 đội", format: "single_elimination",
    });
    for (const id of ["ann", "ben", "cio"]) store.addTournamentEntry(tournament.id, { userId: id });
    const started = store.generateTournamentBracket(tournament.id);
    const [first, second] = started.bracket.rounds[0];
    assert.deepEqual([first.participantAId, first.participantBId, first.status, first.winnerId], ["ann", "__BYE__", "bye", "ann"]);
    assert.deepEqual([second.participantAId, second.participantBId, second.status], ["ben", "cio", "ready"]);
    assert.deepEqual([started.bracket.rounds[1][0].participantAId, started.bracket.rounds[1][0].status], ["ann", "pending"]);

    const semi = playMatch(store, "cio", "ben");
    const afterSemi = store.attachSlotResult(tournament.id, { roundNo: 1, slotIndex: 1, matchId: semi });
    assert.deepEqual(
      [afterSemi.bracket.rounds[1][0].participantAId, afterSemi.bracket.rounds[1][0].participantBId],
      ["ann", "cio"],
    );

    const final = playMatch(store, "cio", "ann");
    const completed = store.attachSlotResult(tournament.id, { roundNo: 2, slotIndex: 0, matchId: final });
    assert.equal(completed.status, "completed");
    assert.equal(completed.champion.id, "cio");
  } finally { store.close(); }
});

test("hồ sơ công khai trả về thống kê trận và giải đã tham gia", () => {
  const store = createMatchStore({ filename: ":memory:" });
  try {
    store.upsertUser({ id: "alice", display_name: "Alice", avatar_url: "/a.png" });
    store.upsertUser({ id: "dave", display_name: "Dave" });
    const tournament = store.createTournament({ gameId: "rps_chess", code: "CUP-P", name: "Cup profile", format: "single_elimination" });
    store.addTournamentEntry(tournament.id, { userId: "alice" });
    playMatch(store, "alice", "dave");

    const profile = store.getUserPublicProfile("alice");
    assert.equal(profile.display_name, "Alice");
    assert.equal(profile.avatar_url, "/a.png");
    assert.deepEqual(profile.stats, { played: 1, wins: 1, draws: 0, losses: 0 });
    assert.deepEqual(profile.tournaments.map((row) => row.code), ["CUP-P"]);
    assert.throws(() => store.getUserPublicProfile("missing"), /not found/);
  } finally { store.close(); }
});
