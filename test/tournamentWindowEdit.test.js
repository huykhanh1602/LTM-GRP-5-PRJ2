import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";
import { createHttpServer } from "../net/http.js";

const USERS = {
  "token-org": { id: "org", display_name: "Chủ giải", role: "player" },
  "token-two": { id: "two", display_name: "Đấu thủ 2", role: "player" },
  "token-three": { id: "three", display_name: "Đấu thủ 3", role: "player" },
  "token-four": { id: "four", display_name: "Đấu thủ 4", role: "player" },
};

const json = async (response) => ({ status: response.status, body: await response.json() });
const hours = (value) => new Date(Date.now() + value * 3600_000).toISOString();

test("HTTP giải đấu: chủ giải sửa khung mở/đóng đơn và lịch liên quan", async (t) => {
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
      ...(typeof token === "string" ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const patchWindow = (id, payload, token = "token-org") =>
    call(`/api/tournaments/${id}/registration-window`, { method: "PATCH", token, body: payload });

  const created = await json(await call("/api/tournaments", {
    method: "POST", token: "token-org",
    body: {
      name: "Cúp Sửa Khung Đơn", startsAt: hours(72), maxParticipants: 4,
      languages: ["python"],
      config: { registrationOpensAt: hours(-24), registrationClosesAt: hours(24) },
    },
  }));
  assert.equal(created.status, 201);
  const id = created.body.id;

  // Cần đăng nhập + chỉ chủ giải được sửa.
  assert.equal((await json(await patchWindow(id, { registrationOpensAt: hours(-1), registrationClosesAt: hours(1) }, null))).status, 401);
  assert.equal((await json(await patchWindow(id, { registrationOpensAt: hours(-1), registrationClosesAt: hours(1) }, "token-two"))).body.error, "ORGANIZER_REQUIRED");

  // Đóng đơn trước mở đơn -> 400.
  const bad = await json(await patchWindow(id, { registrationOpensAt: hours(10), registrationClosesAt: hours(5) }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "INVALID_INPUT");

  // Kéo đóng đơn qua cả ngày khởi tranh -> phải báo để sửa cùng lúc.
  const conflict = await json(await patchWindow(id, { registrationOpensAt: hours(1), registrationClosesAt: hours(200) }));
  assert.equal(conflict.status, 400);
  assert.equal(conflict.body.error, "KICKOFF_BEFORE_CLOSE");

  // Sửa cả khung lẫn ngày khởi tranh: lịch mới được ghi nhận đồng bộ, khung đang mở đơn.
  const saved = await json(await patchWindow(id, {
    registrationOpensAt: hours(-2), registrationClosesAt: hours(48), startsAt: hours(72),
  }));
  assert.equal(saved.status, 200);
  const sameTime = (actual, expected) => Math.abs(Date.parse(actual) - Date.parse(expected)) < 5000;
  assert.ok(sameTime(saved.body.config.registrationOpensAt, hours(-2)), "mở đơn phải được lưu lại");
  assert.ok(sameTime(saved.body.config.registrationClosesAt, hours(48)), "đóng đơn phải được lưu lại");
  assert.ok(sameTime(saved.body.starts_at, hours(72)), "ngày khởi tranh phải được lưu lại");

  // Chưa đóng đơn thì chưa khởi tranh được.
  assert.equal((await json(await call(`/api/tournaments/${id}/start`, { method: "POST", token: "token-org", body: {} }))).body.error, "REGISTRATION_STILL_OPEN");

  for (const token of ["token-org", "token-two", "token-three", "token-four"]) {
    assert.equal((await call(`/api/tournaments/${id}/entries`, { method: "POST", token, body: {} })).status, 201);
  }

  // Đóng đơn lùi về quá khứ -> khởi tranh, và từ đó không sửa khung đăng ký nữa.
  const past = await json(await patchWindow(id, { registrationOpensAt: hours(-48), registrationClosesAt: hours(-1) }));
  assert.equal(past.status, 200);
  assert.equal((await call(`/api/tournaments/${id}/start`, { method: "POST", token: "token-org", body: {} })).status, 200);
  const locked = await json(await patchWindow(id, { registrationOpensAt: hours(1), registrationClosesAt: hours(2) }));
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error, "TOURNAMENT_STARTED");
});
