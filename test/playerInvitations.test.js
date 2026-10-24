import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";

test("team invitation adds the recipient only after acceptance", () => {
  const store = createMatchStore({ filename: ":memory:" });
  try {
    const captain = store.createAuthUser({ display_name: "Captain", email: "captain@example.test" });
    const player = store.createAuthUser({ display_name: "Player", email: "player@example.test" });
    const team = store.registerTeam({ id: "invite-team", name: "Invite Team" });
    store.addTeamMember(team.id, captain.id, "captain");
    const invite = store.createPlayerInvitation({ type: "team", senderId: captain.id, recipientId: player.id, teamId: team.id });
    assert.equal(store.getTeam(team.id).members.length, 1);
    assert.equal(store.listPlayerInvitations(player.id).length, 1);
    assert.equal(store.respondToPlayerInvitation(invite.id, player.id, "accept").status, "accepted");
    assert.equal(store.getTeam(team.id).members.length, 2);
    assert.equal(store.listPlayerInvitations(player.id).length, 0);
    assert.throws(() => store.respondToPlayerInvitation(invite.id, player.id, "accept"), { code: "INVITATION_ALREADY_HANDLED" });
  } finally { store.close(); }
});

test("match invitation is private to its recipient and can be declined", () => {
  const store = createMatchStore({ filename: ":memory:" });
  try {
    const sender = store.createAuthUser({ display_name: "Sender", email: "sender@example.test" });
    const player = store.createAuthUser({ display_name: "Player", email: "player@example.test" });
    const outsider = store.createAuthUser({ display_name: "Outsider", email: "outsider@example.test" });
    const invite = store.createPlayerInvitation({ type: "match", senderId: sender.id, recipientId: player.id, gameId: "rps_chess", roomCode: "AB12" });
    assert.equal(invite.room_code, "AB12");
    assert.throws(() => store.respondToPlayerInvitation(invite.id, outsider.id, "accept"), { code: "INVITATION_NOT_FOUND" });
    assert.equal(store.respondToPlayerInvitation(invite.id, player.id, "decline").status, "declined");
    assert.equal(store.listPlayerInvitations(player.id).length, 0);
  } finally { store.close(); }
});
