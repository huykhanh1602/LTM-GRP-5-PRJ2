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
    close() { if (socket.readyState < 2) socket.close(); },
    drop() { socket.terminate(); },
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
    allowGuestRanked: true,
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

// Ghép 2 người, cho cả hai ngồi sẵn tới khi trận bắt đầu. Trả về đội của từng người.
async function pair(t, server, mode = "casual") {
  const a = await login(t, server, "Alpha");
  const b = await login(t, server, "Beta");
  a.client.send({ type: "find_match", game_id: "rps_chess", mode });
  b.client.send({ type: "find_match", game_id: "rps_chess", mode });
  const [foundA] = await Promise.all([a.client.waitFor(a.client.type("match_found")), b.client.waitFor(b.client.type("match_found"))]);
  for (const { client } of [a, b]) {
    client.send({ type: "submit_bot", mode_type: "code", language: "python", content: "def make_move(*a): return None" });
    await client.waitFor(client.type("bot_accepted"));
    client.send({ type: "ready", ready: true });
  }
  await a.client.waitFor(a.client.type("match_start"));
  const room = server.gateway.rooms.get(foundA.room_id);
  const teamOf = (user) => room.players.find((slot) => slot.userId === user.id).teamId;
  return { a, b, room, teamOf };
}

// Trận giả chạy mãi tới khi bị abortSignal dừng — mô phỏng engine bị giết giữa ván.
function hangingMatch(recorder = {}) {
  return async ({ teamA, teamB, onEvent, abortSignal }) => {
    onEvent({
      type: "match_start",
      match_info: { match_id: "M-F", teams: { team_a: teamA.name, team_b: teamB.name }, started_at: new Date().toISOString() },
      game_config: { board: { width: 8, height: 8 } },
      initial_state: [],
    });
    onEvent({ type: "turn", turn: { turn: 1, player: "team_a", actions: [], events: [] } });
    await new Promise((resolve) => {
      if (abortSignal?.aborted) resolve();
      else abortSignal?.addEventListener("abort", resolve, { once: true });
    });
    recorder.aborted = true;
    return null;
  };
}

const other = (teamId) => (teamId === "team_a" ? "team_b" : "team_a");

test("rời phòng giữa ván: người ở lại thắng vì đối phương bỏ ván", async (t) => {
  const recorder = {};
  const server = await startServer(t, { gateway: { runMatch: hangingMatch(recorder) } });
  const { a, b, teamOf } = await pair(t, server);
  const winnerTeam = other(teamOf(a.user));

  a.client.send({ type: "leave_room" });
  const mine = await a.client.waitFor(a.client.type("game_over"));
  assert.equal(mine.winner, winnerTeam);
  assert.equal(mine.reason, "FORFEIT");
  assert.equal(mine.forfeit, true);
  assert.ok(await a.client.waitFor(a.client.type("room_left")));

  const theirs = await b.client.waitFor(b.client.type("game_over"));
  assert.equal(theirs.winner, winnerTeam);
  assert.equal(theirs.reason, "FORFEIT");
  assert.equal(recorder.aborted, true);
});

test("rớt mạng giữa ván cũng bị xử thua ngay, không chờ hết grace", async (t) => {
  const recorder = {};
  const server = await startServer(t, { gateway: { runMatch: hangingMatch(recorder) } });
  const { a, b, teamOf } = await pair(t, server);
  const winnerTeam = other(teamOf(b.user));

  b.client.drop();
  const over = await a.client.waitFor(a.client.type("game_over"));
  assert.equal(over.winner, winnerTeam);
  assert.equal(over.reason, "FORFEIT");
  assert.equal(recorder.aborted, true);
});

test("bỏ ván vẫn tính Elo và dựng replay cho lịch sử", async (t) => {
  const recorder = {};
  const saved = [];
  const rated = [];
  const server = await startServer(t, {
    gateway: {
      runMatch: hangingMatch(recorder),
      ratingService: {
        applyMatchResult: async (request) => {
          rated.push(request);
          const aWins = request.outcome === "a";
          return { applied: true, a: { change: aWins ? 12 : -12 }, b: { change: aWins ? -12 : 12 } };
        },
      },
      matchStore: {
        importReplay: async (replay, meta) => { saved.push({ replay, meta }); },
        attachSlotResult: async () => ({}),
      },
    },
  });
  const { a, b, teamOf } = await pair(t, server, "ranked");
  const winnerTeam = other(teamOf(a.user));
  const loserChange = winnerTeam === "team_a" ? "elo_change_b" : "elo_change_a";

  a.client.send({ type: "leave_room" });
  await a.client.waitFor(a.client.type("game_over"));
  const over = await b.client.waitFor(b.client.type("game_over"));

  assert.equal(over.reason, "FORFEIT");
  assert.equal(over.rating_saved, true);
  assert.equal(over[loserChange], -12);
  assert.deepEqual(rated.map((request) => request.outcome), [winnerTeam === "team_a" ? "a" : "b"]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].replay.match_info.win_reason, "FORFEIT");
  assert.equal(saved[0].replay.match_info.winner, winnerTeam);
  assert.equal(saved[0].replay.turns.length, 1);
  assert.equal(saved[0].meta.mode, "ranked");
});
