import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createAuthService } from "../net/auth/authService.js";
import { createHttpServer } from "../net/http.js";
import { createWsGateway } from "../net/wsGateway.js";

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
        const timer = setTimeout(() => reject(new Error("Timed out waiting for a WebSocket message.")), ms);
        waiters.push({ predicate, resolve, timer });
      });
    },
    type: (type) => (message) => message.type === type,
    pending: () => [...queue],
    close() { if (socket.readyState < 2) socket.close(); },
  };
}

async function startServer(t, options = {}) {
  const authService = createAuthService({ googleClientId: "test-client" });
  const gateway = createWsGateway({
    sessions: authService.sessions,
    users: authService.users,
    countdownMs: 1,
    graceMs: 60,
    validateBot: async () => ({ ok: true }),
    ...options.gateway,
  });
  const server = createHttpServer({ authService });
  server.on("upgrade", (request, socket, head) => { if (!gateway.handleUpgrade(request, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { gateway.close(); await new Promise((resolve) => server.close(resolve)); });
  return { httpUrl: `http://127.0.0.1:${server.address().port}`, wsUrl: `ws://127.0.0.1:${server.address().port}/ws`, gateway };
}

async function login(t, server, name) {
  const response = await fetch(`${server.httpUrl}/api/auth/guest`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name }),
  });
  const { token, user } = await response.json();
  const client = createClient(server.wsUrl);
  t.after(() => client.close());
  await client.open();
  client.send({ type: "auth", token });
  await client.waitFor(client.type("auth_ok"));
  return { client, user };
}

async function pair(t, server) {
  const a = await login(t, server, "Alpha");
  const b = await login(t, server, "Beta");
  a.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  b.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  const [foundA, foundB] = await Promise.all([a.client.waitFor(a.client.type("match_found")), b.client.waitFor(b.client.type("match_found"))]);
  return { a, b, foundA, foundB };
}

const PAYLOAD = {
  board_state: { width: 8, height: 8, special_tiles: [] },
  my_pieces: [{ id: "A1", type: "ROCK", pos: [0, 0] }],
  opponent_pieces: [{ id: "B1", type: "PAPER", pos: [5, 5] }],
  config: {},
};

// Trận giả: bên A chờ người thật trả lời qua onTurn, bên B đi như bot thường.
function humanAwareMatch(recorder) {
  return async ({ teamA, teamB, onEvent }) => {
    onEvent({ type: "match_start", match_info: { match_id: "M-H", teams: { team_a: teamA.name, team_b: teamB.name } }, game_config: {}, initial_state: [] });
    recorder.controls = { a: teamA.control, b: teamB.control };
    const action = await teamA.onTurn(PAYLOAD, { team: "team_a", deadline_ms: 4000 });
    recorder.action = action;
    onEvent({ type: "turn", turn: { turn: 1, player: "team_a", actions: action ? [action] : [], events: [] } });
    onEvent({ type: "match_end", winner: "team_a", reason: "BASE_CAPTURED" });
    return {
      match_info: { match_id: "M-H", teams: { team_a: teamA.name, team_b: teamB.name }, winner: "team_a", win_reason: "BASE_CAPTURED" },
      game_config: { board: { width: 8, height: 8 } }, initial_state: [],
      turns: [{ turn: 1, player: "team_a", actions: [], events: [] }],
    };
  };
}

// Đợi tin room_state mà chính đội này đã chuyển sang kiểu điều khiển mong muốn.
const controlState = (client, userId, control) => (m) =>
  m.type === "room_state" && m.players.some((p) => p.user_id === userId && p.control === control);

test("chế độ chuột: không cần nộp bot, hết lượt vẫn bắt đầu được trận", async (t) => {
  const recorder = {};
  const server = await startServer(t, { gateway: { runMatch: humanAwareMatch(recorder) } });
  const { a, b } = await pair(t, server);

  a.client.send({ type: "set_control", control: "human" });
  const state = await a.client.waitFor(controlState(a.client, a.user.id, "human"));
  assert.deepEqual(state.allowed_controls, ["bot", "human"]);

  // A không nộp bot mà vẫn sẵn sàng được; B thì cần bot.
  a.client.send({ type: "ready", ready: true });
  await a.client.waitFor(a.client.type("room_state"));
  b.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
  await b.client.waitFor(b.client.type("bot_accepted"));
  b.client.send({ type: "ready", ready: true });
  const turn = await a.client.waitFor(a.client.type("your_turn"), 4000);
  assert.equal(turn.team_id, "team_a");
  assert.ok(turn.deadline_ms > 0);
  a.client.send({ type: "human_move", action: { action_type: "MOVE", piece_id: "A1", to: [1, 1] } });
  await a.client.waitFor(a.client.type("game_over"));

  assert.deepEqual(recorder.controls, { a: "human", b: "bot" });
  assert.deepEqual(recorder.action, { action_type: "MOVE", piece_id: "A1", to: [1, 1] });
});

test("nước đi gửi ngoài lượt hoặc sai dạng bị từ chối", async (t) => {
  const recorder = {};
  const server = await startServer(t, { gateway: { runMatch: humanAwareMatch(recorder) } });
  const { a, b } = await pair(t, server);
  a.client.send({ type: "set_control", control: "human" });
  await a.client.waitFor(controlState(a.client, a.user.id, "human"));

  a.client.send({ type: "human_move", action: { action_type: "MOVE", piece_id: "A1", to: [1, 1] } });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "WRONG_STATE");

  a.client.send({ type: "ready", ready: true });
  b.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
  await b.client.waitFor(b.client.type("bot_accepted"));
  b.client.send({ type: "ready", ready: true });
  await a.client.waitFor(a.client.type("your_turn"));

  a.client.send({ type: "human_move", action: { action_type: "STAY" } });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "INVALID_MESSAGE");
  a.client.send({ type: "human_move", action: { action_type: "MOVE", piece_id: "B1", to: [5, 5] } });
  assert.ok(await a.client.waitFor(a.client.type("game_over"), 4000));
});

test("đã nộp bot thì ván đó không dùng chuột, và ngược lại", async (t) => {
  const server = await startServer(t, { gateway: { runMatch: humanAwareMatch({}) } });
  const { a } = await pair(t, server);

  a.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
  await a.client.waitFor(a.client.type("bot_accepted"));
  a.client.send({ type: "set_control", control: "human" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "BOT_SUBMITTED");

  const b = await login(t, server, "Gamma");
  b.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  const other = await login(t, server, "Delta");
  other.client.send({ type: "find_match", game_id: "rps_chess", mode: "casual" });
  await Promise.all([b.client.waitFor(b.client.type("match_found")), other.client.waitFor(other.client.type("match_found"))]);
  b.client.send({ type: "set_control", control: "human" });
  await b.client.waitFor(controlState(b.client, b.user.id, "human"));
  b.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
  assert.equal((await b.client.waitFor(b.client.type("error"))).code, "MOUSE_MODE");
});

test("kiểu điều khiển bị phòng giới hạn thì bị chặn", async (t) => {
  const server = await startServer(t, { gateway: { runMatch: humanAwareMatch({}) } });
  const { a, foundA } = await pair(t, server);
  server.gateway.rooms.get(foundA.room_id).allowedControls = ["bot"];

  a.client.send({ type: "set_control", control: "human" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "MODE_NOT_ALLOWED");
});

test("ván đang chạy thì không đổi được kiểu điều khiển", async (t) => {
  let releaseTurn;
  t.after(() => releaseTurn?.({ action_type: "MOVE", piece_id: "A1", to: [1, 0] }));
  const slowMatch = async ({ teamA, onEvent }) => {
    onEvent({ type: "match_start", match_info: { match_id: "M-S", teams: {} }, game_config: {}, initial_state: [] });
    const action = await new Promise((resolve) => { releaseTurn = resolve; });
    teamA.onTurn(PAYLOAD, { team: "team_a", deadline_ms: 4000 });
    onEvent({ type: "match_end", winner: "team_a", reason: "BASE_CAPTURED" });
    return { match_info: { match_id: "M-S", winner: "team_a", win_reason: "BASE_CAPTURED", action }, game_config: {}, initial_state: [], turns: [] };
  };
  const server = await startServer(t, { gateway: { runMatch: slowMatch } });
  const { a, b } = await pair(t, server);
  a.client.send({ type: "set_control", control: "human" });
  await a.client.waitFor(controlState(a.client, a.user.id, "human"));
  a.client.send({ type: "ready", ready: true });
  b.client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
  await b.client.waitFor(b.client.type("bot_accepted"));
  b.client.send({ type: "ready", ready: true });
  await a.client.waitFor(a.client.type("match_start"));

  a.client.send({ type: "set_control", control: "bot" });
  assert.equal((await a.client.waitFor(a.client.type("error"))).code, "WRONG_STATE");
  releaseTurn({ action_type: "MOVE", piece_id: "A1", to: [1, 0] });
});
