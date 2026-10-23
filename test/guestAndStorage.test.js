import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createAuthService } from "../net/auth/authService.js";
import { createHttpServer } from "../net/http.js";
import { createStorage } from "../net/storage/index.js";
import { createWsGateway } from "../net/wsGateway.js";

const BOT = "def make_move(*args):\n    return None\n";

function client(url) {
  const socket = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.predicate(message));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(message); } else inbox.push(message);
  });
  return {
    open: () => new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); }),
    send: (m) => socket.send(JSON.stringify(m)),
    waitFor(predicate, ms = 4000) {
      const i = inbox.findIndex(predicate);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for message.")), ms);
        waiters.push({ predicate, resolve, timer });
      });
    },
    close: () => socket.close(),
  };
}

// Dựng server đúng như net/index.js: auth dùng storage (SQLite trong bộ nhớ).
async function setup(t, { gateway: gatewayOptions = {}, storage: storageOverride } = {}) {
  const storage = storageOverride ?? await createStorage({ filename: ":memory:" });
  const authService = createAuthService({
    storage,
    googleClientId: "client-123",
    verifyGoogle: async (token) => (token === "google-credential-xxxxxxxxxxxxxxxx"
      ? { sub: "g-1", email: "vinh@example.com", email_verified: true, name: "Vinh Google", picture: null } : null),
  });
  const gateway = createWsGateway({
    sessions: authService.sessions, users: authService.users, matchStore: storage,
    countdownMs: 1, sweepMs: 10, validateBot: async () => ({ ok: true }), ...gatewayOptions,
  });
  const server = createHttpServer({ matchStore: storage, authService });
  server.on("upgrade", (req, socket, head) => { if (!gateway.handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { gateway.close(); await new Promise((resolve) => server.close(resolve)); await storage.close?.(); });
  const port = server.address().port;
  return { httpUrl: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws`, authService, gateway };
}

const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

async function connect(t, wsUrl, token) {
  const c = client(wsUrl);
  t.after(() => c.close());
  await c.open();
  c.send({ type: "auth", token });
  const ok = await c.waitFor((m) => m.type === "auth_ok");
  return { c, user: ok.user };
}

test("with persistent storage, guests are reported as guests and cannot join ranked", async (t) => {
  const server = await setup(t);
  const guest = await post(`${server.httpUrl}/api/auth/guest`, { display_name: "Khach" });
  assert.equal(guest.user.guest, true);
  const me = await (await fetch(`${server.httpUrl}/api/me`, { headers: { Authorization: `Bearer ${guest.token}` } })).json();
  assert.equal(me.user.guest, true);

  const g = await connect(t, server.wsUrl, guest.token);
  assert.equal(g.user.guest, true);
  g.c.send({ type: "find_match", game_id: "rps_chess", mode: "ranked" });
  assert.equal((await g.c.waitFor((m) => m.type === "error")).code, "MODE_NOT_ALLOWED");
  g.c.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  assert.equal((await g.c.waitFor((m) => m.type === "queue_state")).in_queue, true);

  const google = await post(`${server.httpUrl}/api/auth/google`, { id_token: "google-credential-xxxxxxxxxxxxxxxx" });
  assert.equal(google.user.guest, false);
  const member = await connect(t, server.wsUrl, google.token);
  assert.equal(member.user.guest, false);
  member.c.send({ type: "find_match", game_id: "rps_chess", mode: "ranked" });
  const queued = await member.c.waitFor((m) => m.type === "queue_state");
  assert.equal(queued.mode, "ranked");

  const registered = await post(`${server.httpUrl}/api/auth/register`, { identifier: "an@example.com", display_name: "An", password: "mat-khau-dai" });
  assert.equal(registered.user.guest, false);
});

test("Google login with a wrong credential is rejected with INVALID_PROVIDER_TOKEN", async (t) => {
  const server = await setup(t);
  const res = await fetch(`${server.httpUrl}/api/auth/google`, { method: "POST", body: JSON.stringify({ id_token: "forged" }) });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "INVALID_PROVIDER_TOKEN");
});

test("a failing asynchronous importReplay does not crash the server and the match still ends", async (t) => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.off("unhandledRejection", onUnhandled));

  const base = await createStorage({ filename: ":memory:" });
  let importCalls = 0;
  const storage = new Proxy(base, { get: (target, key) => key === "importReplay"
    ? async () => { importCalls++; await new Promise((r) => setTimeout(r, 5)); throw new Error("db down"); }
    : target[key] });
  const server = await setup(t, {
    storage,
    gateway: {
      async runMatch({ onEvent }) {
        onEvent({ type: "match_start", match_info: { match_id: "M-1", teams: { team_a: "A", team_b: "B" } }, game_config: {}, initial_state: [] });
        onEvent({ type: "match_end", winner: "team_a", reason: "BASE_CAPTURED" });
        return {};
      },
    },
  });
  const accounts = [];
  for (const name of ["Alpha", "Beta"]) {
    const { token } = await post(`${server.httpUrl}/api/auth/guest`, { display_name: name });
    accounts.push(await connect(t, server.wsUrl, token));
  }
  for (const { c } of accounts) c.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  for (const { c } of accounts) await c.waitFor((m) => m.type === "match_found");
  for (const { c } of accounts) {
    c.send({ type: "submit_bot", mode_type: "code", language: "python", content: BOT });
    await c.waitFor((m) => m.type === "bot_accepted");
    c.send({ type: "ready", ready: true });
  }
  assert.equal((await accounts[0].c.waitFor((m) => m.type === "game_over")).winner, "team_a");
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(importCalls, 1);
  assert.deepEqual(unhandled, [], "lỗi lưu replay phải được bắt, không được thành unhandled rejection");
});
