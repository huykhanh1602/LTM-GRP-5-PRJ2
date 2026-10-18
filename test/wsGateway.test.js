import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import WebSocket from "ws";
import { createAuthService } from "../net/auth/authService.js";
import { createHttpServer } from "../net/http.js";
import { createMatchQueue } from "../net/matchmaking/queue.js";
import { createWsGateway } from "../net/wsGateway.js";
import { createMatchStore } from "../net/storage/matchStore.js";

const BOT = "def make_move(*args):\n    return None\n";

function createClient(url) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(({ predicate }) => predicate(message));
    if (index >= 0) {
      const [{ resolve, timer }] = waiters.splice(index, 1);
      clearTimeout(timer);
      resolve(message);
    } else queue.push(message);
  });
  return {
    socket,
    open: () => new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); }),
    send: (message) => socket.send(JSON.stringify(message)),
    waitFor(predicate, ms = 4000) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), ms);
        waiters.push({ predicate, resolve, timer });
      });
    },
    type: (type) => (message) => message.type === type,
    pending: () => [...queue],
    close() { if (socket.readyState < 2) socket.close(); },
  };
}

async function startServer(t, options = {}) {
  const authService = createAuthService({ googleClientId: "test-client", ...options.auth });
  const gateway = createWsGateway({
    sessions: authService.sessions,
    users: authService.users,
    countdownMs: 1,
    graceMs: 60,
    sweepMs: 10,
    queueStateEveryMs: 10,
    validateBot: async () => ({ ok: true }),
    ...options.gateway,
  });
  const server = createHttpServer({ authService, matchStore: options.matchStore });
  server.on("upgrade", (request, socket, head) => { if (!gateway.handleUpgrade(request, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { gateway.close(); await new Promise((resolve) => server.close(resolve)); });
  const port = server.address().port;
  return { httpUrl: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws`, gateway, authService };
}

async function guestToken(httpUrl, name) {
  const response = await fetch(`${httpUrl}/api/auth/guest`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function login(t, server, name) {
  const { token, user } = await guestToken(server.httpUrl, name);
  const client = createClient(server.wsUrl);
  t.after(() => client.close());
  await client.open();
  client.send({ type: "auth", token });
  await client.waitFor(client.type("auth_ok"));
  return { client, user, token };
}

function fakeMatch(winner = "team_a") {
  return async ({ onEvent, teamA, teamB }) => {
    onEvent({ type: "match_start", match_info: { match_id: "M-1", teams: { team_a: teamA.name, team_b: teamB.name } }, game_config: {}, initial_state: [] });
    onEvent({ type: "turn", turn: { turn: 1, player: "team_a", actions: [], events: [] } });
    onEvent({ type: "match_end", winner, reason: "BASE_CAPTURED" });
    return {
      match_info: { match_id: "M-1", teams: { team_a: teamA.name, team_b: teamB.name }, winner, win_reason: "BASE_CAPTURED" },
      game_config: { board: { width: 8, height: 8 } }, initial_state: [],
      turns: [{ turn: 1, player: "team_a", actions: [], events: [{ type: "GAME_OVER", winner_team: winner, reason: "BASE_CAPTURED" }] }],
    };
  };
}

async function pair(t, server, mode = "casual") {
  const a = await login(t, server, "Alpha");
  const b = await login(t, server, "Beta");
  a.client.send({ type: "find_match", game_id: "rps_chess", mode });
  b.client.send({ type: "find_match", game_id: "rps_chess", mode });
  const [foundA, foundB] = await Promise.all([
    a.client.waitFor(a.client.type("match_found")),
    b.client.waitFor(b.client.type("match_found")),
  ]);
  return { a, b, foundA, foundB };
}

test("auth: guest HTTP login, WS auth, and rejection before/with bad token", async (t) => {
  const server = await startServer(t);
  const me = await fetch(`${server.httpUrl}/api/me`, { headers: { Authorization: "Bearer nope" } });
  assert.equal(me.status, 401);

  const anonymous = createClient(server.wsUrl);
  t.after(() => anonymous.close());
  await anonymous.open();
  anonymous.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  assert.equal((await anonymous.waitFor(anonymous.type("error"))).code, "NOT_AUTHENTICATED");
  anonymous.send({ type: "auth", token: "bad" });
  assert.equal((await anonymous.waitFor(anonymous.type("error"))).code, "INVALID_TOKEN");

  const { token, user } = await guestToken(server.httpUrl, "  Vinh  ");
  assert.equal(user.display_name, "Vinh");
  const profile = await (await fetch(`${server.httpUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(profile.user.id, user.id);

  const bad = await fetch(`${server.httpUrl}/api/auth/guest`, { method: "POST", body: JSON.stringify({ display_name: "" }) });
  assert.equal(bad.status, 400);
});

test("auth: Google login verifies the id_token and keeps the same user", async (t) => {
  const calls = [];
  const server = await startServer(t, {
    auth: {
      verifyGoogle: async (idToken, { clientId }) => {
        calls.push(clientId);
        return idToken === "good-token-aaaaaaaaaaaaaaaa" ? { sub: "g-1", email: "v@example.com", name: "Vinh", picture: null } : null;
      },
    },
  });
  const post = (id_token) => fetch(`${server.httpUrl}/api/auth/google`, { method: "POST", body: JSON.stringify({ id_token }) });
  assert.equal((await post("wrong")).status, 401);
  const first = await (await post("good-token-aaaaaaaaaaaaaaaa")).json();
  const second = await (await post("good-token-aaaaaaaaaaaaaaaa")).json();
  assert.equal(first.user.id, second.user.id);
  assert.notEqual(first.token, second.token);
  assert.equal(first.user.guest, false);
  assert.deepEqual(calls, ["test-client", "test-client", "test-client"]);
});

test("protocol errors: bad json, version, unknown type, unknown game, rate limit", async (t) => {
  const server = await startServer(t, { gateway: { maxMessagesPerSecond: 5 } });
  const { client } = await login(t, server, "Alpha");
  client.socket.send("not json");
  assert.equal((await client.waitFor(client.type("error"))).code, "INVALID_MESSAGE");
  client.send({ type: "ping", v: 1 });
  assert.equal((await client.waitFor(client.type("error"))).code, "UNSUPPORTED_PROTOCOL");
  client.send({ type: "turn" });
  assert.equal((await client.waitFor(client.type("error"))).code, "UNKNOWN_TYPE");
  client.send({ type: "ping" });
  assert.equal((await client.waitFor(client.type("pong"))).v, 2);
  client.send({ type: "find_match", game_id: "chess", mode: "casual" });
  assert.equal((await client.waitFor(client.type("error"))).code, "UNKNOWN_GAME");
  client.send({ type: "find_match", game_id: "rps_chess", mode: "tournament" });
  assert.equal((await client.waitFor(client.type("error"))).code, "MODE_NOT_ALLOWED");
  client.send({ type: "cancel_match" });
  assert.equal((await client.waitFor(client.type("error"))).code, "NOT_QUEUED");
  for (let i = 0; i < 8; i++) client.send({ type: "cancel_match" });
  assert.equal((await client.waitFor((m) => m.code === "RATE_LIMITED")).type, "error");
});

test("matchmaking: two clients are paired into one room with queue_state updates", async (t) => {
  const server = await startServer(t);
  const a = await login(t, server, "Alpha");
  a.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  const waiting = await a.client.waitFor(a.client.type("queue_state"));
  assert.equal(waiting.in_queue, true);
  a.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "ALREADY_QUEUED");
  // queue_state được gửi lặp lại trong lúc chờ
  assert.equal((await a.client.waitFor((m) => m.type === "queue_state" && m.in_queue)).mode, "casual");

  const b = await login(t, server, "Beta");
  b.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  const [foundA, foundB] = await Promise.all([
    a.client.waitFor(a.client.type("match_found")),
    b.client.waitFor(b.client.type("match_found")),
  ]);
  assert.equal(foundA.room_id, foundB.room_id);
  assert.match(foundA.room_id, /^[A-Z0-9]{4}$/);
  assert.equal(foundA.opponent.display_name, "Beta");
  assert.equal(foundB.opponent.display_name, "Alpha");
  const state = await a.client.waitFor((m) => m.type === "room_state" && m.players.length === 2);
  assert.deepEqual(state.players.map((p) => p.team_id), ["team_a", "team_b"]);
  assert.equal(state.status, "waiting");
  assert.equal(server.gateway.queue.size, 0);

  a.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "ALREADY_IN_ROOM");
});

test("cancel_match leaves the queue and prevents pairing", async (t) => {
  const server = await startServer(t);
  const a = await login(t, server, "Alpha");
  a.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  await a.client.waitFor(a.client.type("queue_state"));
  a.client.send({ type: "cancel_match" });
  assert.equal((await a.client.waitFor((m) => m.type === "queue_state" && !m.in_queue)).in_queue, false);
  const b = await login(t, server, "Beta");
  b.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  await b.client.waitFor(b.client.type("queue_state"));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(b.client.pending().some((m) => m.type === "match_found"), false);
  assert.equal(server.gateway.queue.size, 1);
});

test("full casual match: submit_bot, ready, countdown, match events, game_over, replay saved unranked", async (t) => {
  const store = createMatchStore({ filename: ":memory:" });
  t.after(() => store.close());
  const server = await startServer(t, { matchStore: store, gateway: { matchStore: store, runMatch: fakeMatch("team_b") } });
  const { a, b } = await pair(t, server);

  a.client.send({ type: "ready", ready: true });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "NO_BOT");
  a.client.send({ type: "submit_bot", mode_type: "code", language: "cpp", content: BOT });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "UNSUPPORTED_LANGUAGE");
  a.client.send({ type: "submit_bot", mode_type: "file", language: "python", filename: "../x.sh", content: BOT });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "INVALID_BOT");
  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "x".repeat(100 * 1024 + 1) });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "BOT_TOO_LARGE");

  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: BOT });
  const accepted = await a.client.waitFor(a.client.type("bot_accepted"));
  assert.equal(accepted.version, 1);
  assert.equal(accepted.bytes, BOT.length);
  assert.match(accepted.sha256, /^[0-9a-f]{64}$/);
  b.client.send({ type: "submit_bot", mode_type: "file", language: "python", filename: "bot_b.py", content: BOT });
  await b.client.waitFor(b.client.type("bot_accepted"));

  a.client.send({ type: "ready", ready: true });
  b.client.send({ type: "ready", ready: true });
  for (const seconds of [3, 2, 1]) assert.equal((await a.client.waitFor(a.client.type("countdown"))).seconds, seconds);
  const start = await a.client.waitFor(a.client.type("match_start"));
  assert.equal(start.match_id, "M-1");
  assert.equal(start.game_id, "rps_chess");
  assert.equal(start.mode, "casual");
  assert.deepEqual(start.match_info.teams, { team_a: "Alpha", team_b: "Beta" });
  assert.equal((await a.client.waitFor(a.client.type("turn"))).turn.turn, 1);
  const over = await b.client.waitFor(b.client.type("game_over"));
  assert.equal(over.winner, "team_b");
  assert.equal(over.reason, "BASE_CAPTURED");
  assert.equal("elo_change_a" in over, false);

  const finished = await a.client.waitFor((m) => m.type === "room_state" && m.status === "finished");
  assert.equal(finished.players.every((p) => !p.ready), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(store.getRankings().map((row) => row.played), [0, 0], "casual không được tính vào bảng xếp hạng");
  assert.equal(store.listMatches({}).items.length, 1);
});

test("ranked: guests are refused unless allowed; elo_change is reported and conserved", async (t) => {
  const refused = await startServer(t);
  const guest = await login(t, refused, "Alpha");
  guest.client.send({ type: "find_match", game_id: "rps_chess", mode: "ranked" });
  assert.equal((await guest.client.waitFor(guest.client.type("error"))).code, "MODE_NOT_ALLOWED");

  const store = createMatchStore({ filename: ":memory:" });
  t.after(() => store.close());
  const server = await startServer(t, { matchStore: store, gateway: { matchStore: store, runMatch: fakeMatch("team_a"), allowGuestRanked: true } });
  const { a, b } = await pair(t, server, "ranked");
  for (const player of [a, b]) {
    player.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: BOT });
    await player.client.waitFor(player.client.type("bot_accepted"));
    player.client.send({ type: "ready", ready: true });
  }
  const over = await a.client.waitFor(a.client.type("game_over"));
  assert.equal(over.winner, "team_a");
  assert.equal(over.elo_change_a, 16);
  assert.equal(over.elo_change_b, -16);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const table = store.getRankings();
  assert.deepEqual(table.map((row) => [row.name, row.played, row.points]), [["Alpha", 1, 3], ["Beta", 1, 0]], "ranked được tính vào bảng xếp hạng");
});

test("create_room, join_room with code, config whitelist, room full and spectators", async (t) => {
  const seen = [];
  const server = await startServer(t, { gateway: { runMatch: async (args) => { seen.push(args.configPatch); return fakeMatch()(args); } } });
  const a = await login(t, server, "Alpha");
  a.client.send({ type: "create_room", game_id: "rps_chess", mode: "ranked" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "MODE_NOT_ALLOWED");
  a.client.send({ type: "create_room", game_id: "rps_chess", mode: "casual", config: { max_turns: 0 } });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "INVALID_MESSAGE");
  a.client.send({ type: "create_room", game_id: "rps_chess", mode: "casual", config: { max_turns: 20, hack: 1 } });
  const created = await a.client.waitFor(a.client.type("room_state"));
  assert.deepEqual(created.config, { max_turns: 20, bot_time_ms: 1000 });
  const code = created.room_id;

  const b = await login(t, server, "Beta");
  b.client.send({ type: "join_room", game_id: "rps_chess", mode: "casual", code: "ZZZZ" });
  assert.equal((await b.client.waitFor(b.client.type("error"))).code, "ROOM_NOT_FOUND");
  b.client.send({ type: "join_room", game_id: "rps_chess", mode: "ranked", code });
  assert.equal((await b.client.waitFor(b.client.type("error"))).code, "MODE_NOT_ALLOWED");
  b.client.send({ type: "join_room", game_id: "rps_chess", mode: "casual", code });
  assert.equal((await b.client.waitFor((m) => m.type === "room_state" && m.players.length === 2)).room_id, code);

  const c = await login(t, server, "Gamma");
  c.client.send({ type: "join_room", game_id: "rps_chess", mode: "casual", code });
  assert.equal((await c.client.waitFor(c.client.type("error"))).code, "ROOM_FULL");
  c.client.send({ type: "watch_room", code });
  assert.equal((await c.client.waitFor(c.client.type("room_state"))).spectators, 1);
  c.client.send({ type: "ready", ready: true });
  assert.equal((await c.client.waitFor(c.client.type("error"))).code, "WRONG_STATE");

  for (const player of [a, b]) {
    player.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: BOT });
    await player.client.waitFor(player.client.type("bot_accepted"));
    player.client.send({ type: "ready", ready: true });
  }
  assert.equal((await c.client.waitFor(c.client.type("game_over"))).winner, "team_a");
  assert.deepEqual(seen[0], { limits: { max_turns: 20, bot_time_ms: 1000 } });

  a.client.send({ type: "leave_room" });
  await a.client.waitFor(a.client.type("room_left"));
  const state = await b.client.waitFor((m) => m.type === "room_state" && m.players.length === 1);
  assert.equal(state.players[0].display_name, "Beta");
});

test("invalid bot is rejected by the validator and does not mark the player as having a bot", async (t) => {
  const server = await startServer(t, { gateway: { validateBot: async () => ({ ok: false, message: "Lỗi cú pháp ở dòng 1" }) } });
  const { a } = await pair(t, server);
  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def (" });
  const error = await a.client.waitFor(a.client.type("error"));
  assert.equal(error.code, "INVALID_BOT");
  assert.match(error.message, /cú pháp/);
  a.client.send({ type: "ready", ready: true });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "NO_BOT");
});

test("reconnect within grace restores the room; a second login replaces the first", async (t) => {
  const server = await startServer(t);
  const { a, b } = await pair(t, server);
  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: BOT });
  await a.client.waitFor(a.client.type("bot_accepted"));

  a.client.close();
  const dropped = await b.client.waitFor((m) => m.type === "room_state" && m.players.some((p) => !p.connected));
  assert.equal(dropped.players[0].connected, false);

  const again = createClient(server.wsUrl);
  t.after(() => again.close());
  await again.open();
  again.send({ type: "auth", token: a.token });
  await again.waitFor(again.type("auth_ok"));
  const restored = await again.waitFor(again.type("room_state"));
  assert.equal(restored.players[0].connected, true);
  assert.equal(restored.players[0].has_bot, true);

  const third = createClient(server.wsUrl);
  t.after(() => third.close());
  await third.open();
  third.send({ type: "auth", token: a.token });
  assert.equal((await again.waitFor(again.type("error"))).code, "REPLACED");
  await third.waitFor(third.type("auth_ok"));
  assert.equal((await third.waitFor(third.type("room_state"))).players[0].connected, true);
});

test("a disconnected player loses the seat after the grace period", async (t) => {
  const server = await startServer(t, { gateway: { graceMs: 30 } });
  const { a, b } = await pair(t, server);
  a.client.close();
  const left = await b.client.waitFor((m) => m.type === "room_state" && m.players.length === 1, 1000);
  assert.equal(left.players[0].display_name, "Beta");
});

test("ranked queue only pairs players whose rating gap fits the growing window", () => {
  let now = 0;
  const queue = createMatchQueue({ now: () => now, windowBase: 100, windowPerSec: 20 });
  queue.add({ userId: "low", gameId: "g", mode: "ranked", rating: 1000 });
  queue.add({ userId: "high", gameId: "g", mode: "ranked", rating: 1300 });
  assert.deepEqual(queue.takePairs(), []);
  now = 5000; // cho phép 100 + 20*5 = 200 < 300
  assert.deepEqual(queue.takePairs(), []);
  now = 10000; // 300
  const pairs = queue.takePairs();
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].map((entry) => entry.userId).sort(), ["high", "low"]);
  assert.equal(queue.size, 0);

  queue.add({ userId: "c1", gameId: "g", mode: "casual" });
  queue.add({ userId: "r1", gameId: "g", mode: "ranked", rating: 1000 });
  assert.deepEqual(queue.takePairs(), [], "casual và ranked không ghép với nhau");
});

test("end to end with the real Python engine and real bot validation", async (t) => {
  const store = createMatchStore({ filename: ":memory:" });
  t.after(() => store.close());
  const server = await startServer(t, { matchStore: store, gateway: { matchStore: store, validateBot: undefined, countdownMs: 5 } });
  const { a, b } = await pair(t, server);
  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(:" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "INVALID_BOT");

  const bots = await Promise.all(["bot_sample_1.py", "bot_sample_2.py"].map((name) => readFile(new URL(`../engine/${name}`, import.meta.url), "utf8")));
  for (const [player, content] of [[a, bots[0]], [b, bots[1]]]) {
    player.client.send({ type: "submit_bot", mode_type: "code", language: "python", content });
    await player.client.waitFor(player.client.type("bot_accepted"));
    player.client.send({ type: "ready", ready: true });
  }
  const start = await a.client.waitFor(a.client.type("match_start"), 15000);
  assert.equal(start.game_id, "rps_chess");
  const over = await a.client.waitFor(a.client.type("game_over"), 30000);
  assert.ok(["team_a", "team_b", "draw"].includes(over.winner));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(store.listMatches({}).items.length, 1);
});
