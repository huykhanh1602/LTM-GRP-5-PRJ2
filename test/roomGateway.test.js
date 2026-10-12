import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createHttpServer } from "../net/http.js";
import { createRoomGateway } from "../net/roomGateway.js";

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
    } else {
      queue.push(message);
    }
  });

  return {
    socket,
    async open() {
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
    },
    send(message) {
      socket.send(JSON.stringify(message));
    },
    waitFor(predicate) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(new Error("Timed out waiting for WebSocket message."));
        }, 3000);
        waiters.push({ predicate, resolve, timer });
      });
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    },
  };
}

async function startServer(t, gateway) {
  const server = createHttpServer({ roomGateway: gateway });
  server.on("upgrade", (request, socket, head) => {
    if (!gateway.handleUpgrade(request, socket, head)) socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of gateway.wss.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;
  return {
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
  };
}

test("players upload bots, ready up, and receive streamed engine events", async (t) => {
  let engineRun = false;
  let matchRuns = 0;
  const gateway = createRoomGateway({
    countdownMs: 1,
    async runMatch({ roomCode, teamA, teamB, onEvent }) {
      engineRun = true;
      matchRuns++;
      assert.equal(roomCode, "AB23");
      assert.equal(teamA.code, "def make_move(*args): return None");
      assert.equal(teamB.code, "def make_move(*args): return None");
      onEvent({
        type: "match_start",
        match_info: { match_id: `test-match-${matchRuns}`, teams: { team_a: "Alpha", team_b: "Beta" } },
        game_config: { board: { width: 8, height: 8 } },
        initial_state: [],
      });
      onEvent({ type: "turn", turn: { turn: 1, player: "team_a", actions: [], events: [] } });
      onEvent({ type: "match_end", winner: null, reason: "DRAW" });
    },
  });
  const { httpUrl, wsUrl } = await startServer(t, gateway);
  const alpha = createClient(`${wsUrl}/rooms/AB23`);
  const beta = createClient(`${wsUrl}/rooms/AB23`);
  t.after(() => { alpha.close(); beta.close(); });
  await Promise.all([alpha.open(), beta.open()]);

  alpha.send({ type: "join_room", code: "AB23", team_name: "Alpha", role: "player" });
  beta.send({ type: "join_room", code: "AB23", team_name: "Beta", role: "player" });
  const [alphaJoined, betaJoined] = await Promise.all([
    alpha.waitFor((message) => message.type === "joined"),
    beta.waitFor((message) => message.type === "joined"),
  ]);
  assert.equal(alphaJoined.team_id, "team_a");
  assert.equal(betaJoined.team_id, "team_b");

  const submit = (token, source) => fetch(
    `${httpUrl}/api/rooms/AB23/submissions?filename=bot.py`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: source,
    }
  );
  for (const token of [alphaJoined.player_token, betaJoined.player_token]) {
    const response = await submit(token, "def make_move(*args): return None");
    assert.equal(response.status, 200);
  }

  alpha.send({ type: "ready", ready: true });
  beta.send({ type: "ready", ready: true });
  const [start, turn, end] = await Promise.all([
    alpha.waitFor((message) => message.type === "match_start"),
    alpha.waitFor((message) => message.type === "turn"),
    beta.waitFor((message) => message.type === "match_end"),
  ]);
  assert.equal(start.match_info.match_id, "test-match-1");
  assert.equal(turn.turn.turn, 1);
  assert.equal(end.reason, "DRAW");
  assert.equal(engineRun, true);

  await Promise.all([
    alpha.waitFor((message) => message.type === "room_state" && message.room.status === "finished"),
    beta.waitFor((message) => message.type === "room_state" && message.room.status === "finished"),
  ]);
  alpha.send({ type: "ready", ready: true });
  const waiting = await alpha.waitFor(
    (message) => message.type === "room_state"
      && message.room.status === "waiting"
      && message.room.teams[0].ready
  );
  assert.equal(waiting.room.teams[0].submitted, true);
  assert.equal(waiting.room.teams[0].ready, true);

  beta.send({ type: "ready", ready: true });
  const rematch = await beta.waitFor(
    (message) => message.type === "match_start" && message.match_info.match_id === "test-match-2"
  );
  assert.equal(rematch.match_info.match_id, "test-match-2");
  assert.equal(matchRuns, 2);
});

test("engine continues streaming to the connected player after the opponent disconnects", async (t) => {
  let completeMatch;
  let engineStarted;
  const started = new Promise((resolve) => { engineStarted = resolve; });
  const gateway = createRoomGateway({
    countdownMs: 1,
    async runMatch({ onEvent }) {
      onEvent({
        type: "match_start",
        match_info: { match_id: "disconnect-test", teams: { team_a: "Alpha", team_b: "Beta" } },
        game_config: { board: { width: 8, height: 8 } },
        initial_state: [],
      });
      engineStarted();
      await new Promise((resolve) => { completeMatch = resolve; });
      onEvent({ type: "turn", turn: { turn: 1, player: "team_a", actions: [], events: [] } });
      onEvent({ type: "match_end", winner: "team_a", reason: "TEST" });
    },
  });
  const { httpUrl, wsUrl } = await startServer(t, gateway);
  const alpha = createClient(`${wsUrl}/rooms/EF67`);
  const beta = createClient(`${wsUrl}/rooms/EF67`);
  t.after(() => { alpha.close(); beta.close(); });
  await Promise.all([alpha.open(), beta.open()]);
  alpha.send({ type: "join_room", code: "EF67", team_name: "Alpha", role: "player" });
  beta.send({ type: "join_room", code: "EF67", team_name: "Beta", role: "player" });
  const [alphaJoined, betaJoined] = await Promise.all([
    alpha.waitFor((message) => message.type === "joined"),
    beta.waitFor((message) => message.type === "joined"),
  ]);

  for (const token of [alphaJoined.player_token, betaJoined.player_token]) {
    const response = await fetch(`${httpUrl}/api/rooms/EF67/submissions?filename=bot.py`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: "def make_move(*args): return None",
    });
    assert.equal(response.status, 200);
  }
  alpha.send({ type: "ready", ready: true });
  beta.send({ type: "ready", ready: true });
  await Promise.all([
    alpha.waitFor((message) => message.type === "match_start"),
    beta.waitFor((message) => message.type === "match_start"),
    started,
  ]);

  alpha.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  completeMatch();
  const [turn, end] = await Promise.all([
    beta.waitFor((message) => message.type === "turn"),
    beta.waitFor((message) => message.type === "match_end"),
  ]);
  assert.equal(turn.turn.turn, 1);
  assert.equal(end.winner, "team_a");
});

test("bot submissions require a room token and reject unsupported or oversized files", async (t) => {
  const gateway = createRoomGateway();
  const { httpUrl, wsUrl } = await startServer(t, gateway);
  const player = createClient(`${wsUrl}/rooms/CD45`);
  t.after(() => player.close());
  await player.open();
  player.send({ type: "join_room", code: "CD45", team_name: "Gamma", role: "player" });
  const joined = await player.waitFor((message) => message.type === "joined");

  const reconnect = createClient(`${wsUrl}/rooms/CD45`);
  t.after(() => reconnect.close());
  await reconnect.open();
  reconnect.send({
    type: "join_room",
    code: "CD45",
    team_name: "Gamma",
    team_id: joined.team_id,
    role: "player",
  });
  const rejoined = await reconnect.waitFor((message) => message.type === "joined");
  assert.equal(rejoined.team_id, joined.team_id);
  assert.notEqual(rejoined.player_token, joined.player_token);

  const endpoint = `${httpUrl}/api/rooms/CD45/submissions`;
  const unauthorized = await fetch(`${endpoint}?filename=bot.py`, {
    method: "POST",
    headers: { Authorization: `Bearer ${joined.player_token}` },
    body: "print('bot')",
  });
  assert.equal(unauthorized.status, 401);

  const invalidExtension = await fetch(`${endpoint}?filename=bot.js`, {
    method: "POST",
    headers: { Authorization: `Bearer ${rejoined.player_token}` },
    body: "console.log('not a Python bot')",
  });
  assert.equal(invalidExtension.status, 400);

  const oversized = await fetch(`${endpoint}?filename=bot.py`, {
    method: "POST",
    headers: { Authorization: `Bearer ${rejoined.player_token}` },
    body: "x".repeat(100 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
});
