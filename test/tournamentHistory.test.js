import test from "node:test";
import assert from "node:assert/strict";
import { createMatchStore } from "../net/storage/matchStore.js";

test("tournament history records finished round matches and champion", () => {
  const store=createMatchStore({filename:":memory:"});
  try {
    const tournament=store.createTournament({gameId:"rps_chess",code:"TEST-CHAMP",name:"Test cup",format:"single_elimination"});
    store.updateTournamentStatus(tournament.id,"open");
    store.updateTournamentStatus(tournament.id,"in_progress");
    const round=store.createTournamentRound(tournament.id,{roundNo:1});
    const match=store.startMatch({roomId:"cup-room",roundId:round.id,mode:"tournament",ranked:false,
      teamA:{id:"alpha",name:"Alpha"},teamB:{id:"beta",name:"Beta"},initialState:[]});
    store.finishMatch(match.id,{winner:"alpha",reason:"BASE_CAPTURED"},[]);
    let detail=store.getTournament(tournament.id);
    assert.equal(detail.rounds[0].matches.length,1);
    assert.equal(detail.rounds[0].matches[0].winner_id,"alpha");
    assert.equal(detail.rounds[0].matches[0].participant_b_name,"Beta");
    assert.equal(detail.champion,null);
    detail=store.updateTournamentStatus(tournament.id,"completed");
    assert.deepEqual(detail.champion,{id:"alpha",name:"Alpha"});
    assert.equal(detail.status,"completed");
  } finally { store.close(); }
});
