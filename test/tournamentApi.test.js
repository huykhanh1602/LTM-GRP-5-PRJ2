import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";
import { createHttpServer } from "../net/http.js";

const USERS = {
  "token-org": { id: "org", display_name: "Chủ giải", role: "player" },
  "token-two": { id: "two", display_name: "Đấu thủ 2", role: "player" },
  "token-three": { id: "three", display_name: "Đấu thủ 3", role: "player" },
};

const json = async (response) => ({ status: response.status, body: await response.json() });

test("HTTP giải đấu: tạo giải, đăng ký, khóa đăng ký và chỉ hỗ trợ cập nhật kết quả nội bộ", async (t) => {
  const store = createMatchStore({ filename: ":memory:" });
  for (const user of Object.values(USERS)) store.upsertUser(user);
  const server = createHttpServer({
    matchStore: store,
    authenticate: async (request) => {
      const token = request.headers.authorization?.replace(/^Bearer\s+/, "");
      return USERS[token] ? { user: USERS[token] } : null;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = "GET", token, body } = {}) => fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Người chơi thường vẫn tạo được giải và tự thành chủ giải.
  const created = await json(await call("/api/tournaments", {
    method: "POST", token: "token-org",
    body: {
      name: "Cúp KBB mùa thu", startsAt: new Date(Date.now() + 3600_000).toISOString(),
      rules: ["Bo1", "Không gọi mạng"], languages: ["python", "javascript"], maxParticipants: 8,
      prize: "Cúp + Elo", description: "Giải nội bộ",
    },
  }));
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "open");
  assert.match(created.body.code, /^[A-Z0-9-]{3,24}$/);
  assert.equal(created.body.config.organizerId, "org");
  assert.deepEqual(created.body.config.languages, ["python", "javascript"]);
  const id = created.body.id;

  assert.equal((await json(await call("/api/tournaments", { method: "POST", token: "token-org", body: { name: "" } }))).status, 400);
  assert.equal((await json(await call("/api/tournaments", { method: "POST", token: "token-org", body: { name: "x", languages: ["brainfuck"] } }))).status, 400);

  // Đăng ký tham gia: mỗi người một lần.
  assert.equal((await call(`/api/tournaments/${id}/entries`, { method: "POST", token: "token-org", body: {} })).status, 201);
  assert.equal((await json(await call(`/api/tournaments/${id}/entries`, { method: "POST", token: "token-org", body: {} }))).body.error, "ENTRY_EXISTS");
  assert.equal((await call(`/api/tournaments/${id}/entries`, { method: "POST", token: "token-two", body: {} })).status, 201);
  assert.equal((await json(await call(`/api/tournaments/${id}/entries`, { method: "POST", body: {} }))).status, 401);

  const detail = await json(await call(`/api/tournaments/${id}`));
  assert.equal(detail.body.participant_count, 2);
  assert.equal(detail.body.entries[0].display_name, "Chủ giải");
  assert.ok(detail.body.entries[0].avatar_url === null || typeof detail.body.entries[0].avatar_url === "string");

  // Chỉ chủ giải mới được khởi tranh; người lạ bị chặn.
  assert.equal((await json(await call(`/api/tournaments/${id}/start`, { method: "POST", token: "token-two" }))).status, 403);
  const started = await json(await call(`/api/tournaments/${id}/start`, { method: "POST", token: "token-org" }));
  assert.equal(started.status, 200);
  assert.equal(started.body.status, "in_progress");
  assert.equal(started.body.bracket.totalRounds, 1);
  assert.deepEqual(
    started.body.bracket.rounds[0].map((slot) => [slot.participantAId, slot.participantBId, slot.status]),
    [["org", "two", "ready"]],
  );

  // Giải đang diễn ra thì đóng đăng ký.
  assert.equal((await json(await call(`/api/tournaments/${id}/entries`, { method: "POST", token: "token-three", body: {} }))).body.error, "TOURNAMENT_NOT_OPEN");

  // Không còn API cho BTC gắn kết quả một trận đấu bên ngoài vào giải.
  const foreign = store.startMatch({ roomId: "R", mode: "casual", ranked: false, initialState: [], teamA: { id: "org", name: "Chủ giải" }, teamB: { id: "two", name: "Đấu thủ 2" } });
  store.finishMatch(foreign.id, { winner: "org" }, []);
  assert.throws(
    () => store.attachSlotResult(id, { roundNo: 1, slotIndex: 0, matchId: foreign.id }),
    (error) => error.code === "MATCH_NOT_TOURNAMENT",
  );
  const externalAttach = await json(await call(`/api/tournaments/${id}/rounds/1/slots/0/result`, { method: "POST", token: "token-org", body: { match_id: foreign.id } }));
  assert.equal(externalAttach.status, 405);
  const manualResult = await json(await call(`/api/tournaments/${id}/matches`, {
    method: "POST", token: "token-org",
    body: { round_id: started.body.rounds[0].id, participant_a_id: "org", participant_b_id: "two", winner_id: "org" },
  }));
  assert.equal(manualResult.status, 405);

  // Kết quả trận đấu được lưu bởi phòng thi đấu của giải và tự động điền vào nhánh.
  const real = store.startMatch({ roomId: "R", mode: "tournament", ranked: false, initialState: [], teamA: { id: "two", name: "Đấu thủ 2" }, teamB: { id: "org", name: "Chủ giải" } });
  store.finishMatch(real.id, { winner: "two", reason: "BASE_CAPTURED" }, []);
  const finished = store.attachSlotResult(id, { roundNo: 1, slotIndex: 0, matchId: real.id });
  assert.equal(finished.status, "completed");
  assert.deepEqual(finished.champion, { id: "two", name: "Đấu thủ 2" });
  assert.equal(finished.bracket.rounds[0][0].matchId, real.id);

  // Hồ sơ công khai của người tham gia.
  const profile = await json(await call("/api/users/two"));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.display_name, "Đấu thủ 2");
  assert.deepEqual(profile.body.stats, { played: 2, wins: 1, draws: 0, losses: 1 });
  assert.deepEqual(profile.body.tournaments.map((row) => row.id), [id]);
  assert.equal((await call("/api/users/khong-ton-tai")).status, 404);

  // Replay của trận chung kết xem lại được.
  const replay = await json(await call(`/api/matches/${real.id}/replay`));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.match_info.winner, "team_a");
});
