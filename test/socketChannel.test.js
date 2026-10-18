import test from "node:test";
import assert from "node:assert/strict";
import { createSocketChannel, toUiMessage, toUiRoom } from "../src/api/socket.js";
import { createAuthService } from "../net/auth/authService.js";
import { createHttpServer } from "../net/http.js";
import { createWsGateway } from "../net/wsGateway.js";

const BOT = "def make_move(*args):\n    return None\n";

test("toUiRoom always returns two team slots and marks the current user", () => {
  const room = toUiRoom({
    room_id: "AB23", status: "waiting", mode: "casual", game_id: "rps_chess", spectators: 1,
    players: [{ user_id: "u1", display_name: "Alpha", team_id: "team_a", has_bot: true, filename: "a.py", ready: false, connected: true }],
  }, "u1");
  assert.equal(room.code, "AB23");
  assert.deepEqual(room.teams[0], { id: "team_a", name: "Alpha", isMe: true, connected: true, submitted: true, ready: false, filename: "a.py" });
  assert.deepEqual(room.teams[1], { id: "team_b", name: "", isMe: false, connected: false, submitted: false, ready: false, filename: null });
});

test("toUiMessage maps game_over to match_end and hides channel-only messages", () => {
  assert.deepEqual(toUiMessage({ type: "game_over", match_id: "M", winner: "draw", reason: "DRAW" }, "u"), {
    type: "match_end", match_id: "M", winner: null, reason: "DRAW", elo_change_a: undefined, elo_change_b: undefined,
  });
  assert.equal(toUiMessage({ type: "game_over", winner: "team_b" }, "u").winner, "team_b");
  assert.equal(toUiMessage({ type: "bot_accepted" }, "u"), null);
  assert.deepEqual(toUiMessage({ type: "error", code: "NO_BOT", message: "Hãy nộp bot" }, "u"), { type: "error", code: "NO_BOT", message: "Hãy nộp bot" });
});

function collector(channel) {
  const messages = [];
  const waiters = [];
  channel.on((m) => {
    const i = waiters.findIndex((w) => w.predicate(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else messages.push(m);
  });
  return (predicate, ms = 4000) => {
    const i = messages.findIndex(predicate);
    if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for UI message.")), ms);
      waiters.push({ predicate, resolve, timer });
    });
  };
}

test("the real client channel pairs, submits a bot, readies and receives match_end through the v2 server", async (t) => {
  const authService = createAuthService();
  const gateway = createWsGateway({
    sessions: authService.sessions, users: authService.users, countdownMs: 1, sweepMs: 10, graceMs: 50,
    validateBot: async () => ({ ok: true }),
    async runMatch({ onEvent, teamA, teamB }) {
      onEvent({ type: "match_start", match_info: { match_id: "M-9", teams: { team_a: teamA.name, team_b: teamB.name } }, game_config: {}, initial_state: [] });
      onEvent({ type: "match_end", winner: "team_a", reason: "BASE_CAPTURED" });
      return {};
    },
  });
  const server = createHttpServer({ authService });
  server.on("upgrade", (req, socket, head) => { if (!gateway.handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { gateway.close(); await new Promise((resolve) => server.close(resolve)); });
  const port = server.address().port;
  const endpoints = { wsUrl: `ws://127.0.0.1:${port}`, httpUrl: `http://127.0.0.1:${port}` };

  const alpha = createSocketChannel({ ...endpoints, teamName: "Alpha", role: "player", find: true, mode: "casual" });
  const beta = createSocketChannel({ ...endpoints, teamName: "Beta", role: "player", find: true, mode: "casual" });
  t.after(() => { alpha.close(); beta.close(); });
  const waitA = collector(alpha);
  const waitB = collector(beta);

  assert.equal((await waitA((m) => m.type === "queue_state")).in_queue, true);
  assert.equal((await waitA((m) => m.type === "match_found")).opponent.display_name, "Beta");
  const roomA = await waitA((m) => m.type === "room_state" && m.room.teams.every((team) => team.name));
  assert.deepEqual(roomA.room.teams.map((team) => [team.name, team.isMe]), [["Alpha", true], ["Beta", false]]);
  await waitB((m) => m.type === "match_found");

  await assert.rejects(alpha.submitCode(new File(["x"], "bot.txt")), (error) => /py/i.test(error.message) || /bot/i.test(error.message));
  const accepted = await alpha.submitCode(new File([BOT], "bot_alpha.py"));
  assert.equal(accepted.filename, "bot_alpha.py");
  await beta.submitCode(new File([BOT], "bot_beta.py"));

  alpha.send({ type: "ready", ready: true });
  beta.send({ type: "ready", ready: true });
  assert.equal((await waitA((m) => m.type === "countdown" && m.seconds === 3)).seconds, 3);
  const start = await waitA((m) => m.type === "match_start");
  assert.equal(start.match_info.match_id, "M-9");
  const end = await waitB((m) => m.type === "match_end");
  assert.equal(end.winner, "team_a");

  alpha.close();
  const left = await waitB((m) => m.type === "room_state" && m.room.teams[0].name === "" && m.room.status !== "playing", 2000);
  assert.equal(left.room.teams[1].name, "Beta");
});

test("the channel reports an error when login fails", async () => {
  const channel = createSocketChannel({ wsUrl: "ws://127.0.0.1:1", httpUrl: "http://127.0.0.1:1", teamName: "A", role: "player", create: true, code: "ABCD" });
  const wait = collector(channel);
  const error = await wait((m) => m.type === "error");
  assert.match(error.message, /đăng nhập/);
  channel.close();
});
