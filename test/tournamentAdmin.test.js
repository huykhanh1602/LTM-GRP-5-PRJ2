import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";
import { createHttpServer } from "../net/http.js";

const USERS = {
  "token-org": { id: "org", display_name: "Chủ giải", role: "player" },
  "token-admin": { id: "admin", display_name: "Admin", role: "admin" },
};

const json = async (response) => ({ status: response.status, body: await response.json() });

test("HTTP Admin: quản lý lịch trình giải đấu", async (t) => {
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

  // Tạo giải
  const created = await json(await call("/api/tournaments", {
    method: "POST", token: "token-org",
    body: { name: "Giải Admin", format: "single_elimination" },
  }));
  const id = created.body.id;

  // 1. PATCH /api/tournaments/:id/schedule
  const scheduled = await json(await call(`/api/tournaments/${id}/schedule`, {
    method: "PATCH", token: "token-admin",
    body: { scheduled_at: new Date().toISOString() },
  }));
  assert.equal(scheduled.status, 200);
  assert.ok(scheduled.body.starts_at);

  // 2. PATCH /api/tournaments/:id/rounds/:roundId/schedule
  // Cần tạo round trước
  const round = await json(await call(`/api/tournaments/${id}/rounds`, {
    method: "POST", token: "token-org",
    body: { roundNo: 1 },
  }));
  const roundId = round.body.id;

  const roundScheduled = await json(await call(`/api/tournaments/${id}/rounds`, {
    method: "PATCH", token: "token-admin",
    body: { round_id: roundId, scheduled_at: new Date().toISOString(), auto_start: true },
  }));
  assert.equal(roundScheduled.status, 200);
  assert.ok(roundScheduled.body.scheduled_at);

  // 3. POST /api/tournaments/:id/rounds/:roundId/trigger-start
  const triggered = await json(await call(`/api/tournaments/${id}/rounds/trigger-start`, {
    method: "POST", token: "token-admin",
    body: { round_id: roundId },
  }));
  assert.equal(triggered.status, 200);
  assert.equal(triggered.body.auto_start, 1);

  // 4. POST /api/matches/:id/reschedule
  // Cần tạo match trước
  const match = store.startMatch({
    roomId: "R", teamA: { id: "org", name: "A" }, teamB: { id: "two", name: "B" },
    startedAt: new Date().toISOString()
  });
  const rescheduled = await json(await call(`/api/matches/${match.id}/reschedule`, {
    method: "POST", token: "token-admin",
    body: { scheduled_at: new Date().toISOString() },
  }));
  assert.equal(rescheduled.status, 200);
  assert.ok(rescheduled.body.scheduled_at);
});
