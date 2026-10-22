import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createFrames, appendTurn as appendReplayTurn } from '../../src/utils/replayEngine.js';
import { StorageError } from './matchStore.js';

const required = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new StorageError('INVALID_INPUT', `${field} must be a non-empty string`);
  return value.trim();
};
const page = (value, fallback, max) => {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max || String(value).trim() === '') {
    throw new StorageError('INVALID_PAGINATION', 'Invalid limit or offset');
  }
  return number;
};
const iso = value => {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new StorageError('INVALID_INPUT', 'Invalid timestamp');
  return date.toISOString();
};
const mapMatch = row => {
  if (!row) return null;
  const { config, initial_state, final_state, result, ...match } = row;
  return { ...match, started_at: new Date(match.started_at).toISOString(),
    ended_at: match.ended_at ? new Date(match.ended_at).toISOString() : null,
    config, initial_state, final_state, result };
};

export function createPostgresMatchStore({ connectionString = process.env.DATABASE_URL, poolOptions = {} } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL storage');
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000, ssl: { rejectUnauthorized: false }, ...poolOptions });
  const schema = readFileSync(new URL('./postgres-schema.sql', import.meta.url), 'utf8');
  let ready;
  function initialize() {
    return ready ??= pool.query(schema).then(() => undefined);
  }
  async function query(text, values = [], client = pool) {
    await initialize();
    return client.query(text, values);
  }
  async function transaction(work) {
    await initialize();
    const client = await pool.connect();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function registerTeam({ id, name = id }, client = pool) {
    id = required(id, 'team.id'); name = required(name, 'team.name');
    await query(`INSERT INTO teams(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name`, [id, name], client);
    return (await query('SELECT id,name,created_at FROM teams WHERE id=$1', [id], client)).rows[0];
  }
  async function getMatch(id, client = pool, lock = false) {
    const row = (await query(`SELECT * FROM matches WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id], client)).rows[0];
    if (!row) throw new StorageError('MATCH_NOT_FOUND', 'Match not found', 404);
    return mapMatch(row);
  }
  async function startMatch({ id = randomUUID(), roomId, gameId = 'rps_chess', mode, roundId = null,
    teamA, teamB, ranked = true, config = {}, initialState = null, startedAt }, client = pool) {
    id = required(id, 'match.id'); roomId = required(roomId, 'roomId');
    gameId = required(gameId, 'gameId'); mode ??= ranked ? 'ranked' : 'casual';
    if (!teamA || !teamB || teamA.id === teamB.id || typeof ranked !== 'boolean' ||
      !['casual','ranked','tournament'].includes(mode) || (mode === 'ranked' && !ranked) || (mode === 'casual' && ranked))
      throw new StorageError('INVALID_INPUT', 'Two distinct teams and a valid match mode are required');
    await registerTeam(teamA, client); await registerTeam(teamB, client);
    try {
      await query(`INSERT INTO matches(id,room_id,game_id,mode,round_id,team_a_id,team_b_id,status,ranked,started_at,config,initial_state,final_state)
        VALUES($1,$2,$3,$4,$5,$6,$7,'playing',$8,$9,$10::jsonb,$11::jsonb,$11::jsonb)`,
      [id, roomId, gameId, mode, roundId, teamA.id, teamB.id, ranked, iso(startedAt), JSON.stringify(config), JSON.stringify(initialState)], client);
    } catch (error) {
      if (error.code === '23505') throw new StorageError('MATCH_EXISTS', 'Match ID already exists', 409);
      throw error;
    }
    return getMatch(id, client);
  }
  async function appendTurn(id, { turn, player = null, actions = [], events = [], state = null }) {
    if (!Number.isSafeInteger(turn) || turn < 0 || !Array.isArray(actions) || !Array.isArray(events)) throw new StorageError('INVALID_INPUT', 'Invalid turn, actions or events');
    return transaction(async client => {
      const match = await getMatch(id, client, true);
      if (match.status !== 'playing') throw new StorageError('MATCH_CLOSED', 'Match is closed', 409);
      if (player !== null && ![match.team_a_id, match.team_b_id].includes(player)) throw new StorageError('INVALID_INPUT', 'Player is not a match participant');
      const last = (await query('SELECT MAX(turn) AS turn FROM match_turns WHERE match_id=$1', [id], client)).rows[0].turn;
      if (last !== null && turn <= Number(last)) throw new StorageError('STALE_TURN', 'Turn must increase', 409);
      await query(`INSERT INTO match_turns(match_id,turn,player,actions,events,state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [id, turn, player, JSON.stringify(actions), JSON.stringify(events), JSON.stringify(state)], client);
      await query('UPDATE matches SET final_state=$1::jsonb WHERE id=$2', [JSON.stringify(state), id], client);
      return { match_id: id, turn };
    });
  }
  async function finishMatch(id, result = null, finalState = undefined, endedAt = undefined) {
    return transaction(async client => {
      const match = await getMatch(id, client, true);
      if (match.status !== 'playing') return match;
      const winner = result?.winner_team ?? result?.winner ?? null;
      if (winner !== null && ![match.team_a_id, match.team_b_id].includes(winner)) throw new StorageError('INVALID_WINNER', 'Winner must be a participant');
      if (winner !== null && result?.draw === true) throw new StorageError('INVALID_RESULT', 'Draw cannot have a winner');
      const status = winner !== null || result?.draw === true ? 'finished' : 'aborted';
      await query(`UPDATE matches SET status=$1,winner_id=$2,reason=$3,ended_at=$4,result=$5::jsonb,final_state=$6::jsonb WHERE id=$7`,
        [status, winner, result?.reason ?? null, iso(endedAt), JSON.stringify(result), JSON.stringify(finalState === undefined ? match.final_state : finalState), id], client);
      if(match.round_id) {
        const round=(await query('SELECT tournament_id FROM tournament_rounds WHERE id=$1',[match.round_id],client)).rows[0];
        if(round) {
          const names=(await query('SELECT id,name FROM teams WHERE id=ANY($1::text[])',[[match.team_a_id,match.team_b_id]],client)).rows;
          const byId=Object.fromEntries(names.map(team=>[team.id,team.name]));
          await recordTournamentMatchInternal({tournamentId:round.tournament_id,roundId:match.round_id,matchId:id,
            participantAId:match.team_a_id,participantAName:byId[match.team_a_id],participantBId:match.team_b_id,
            participantBName:byId[match.team_b_id],winnerId:winner,result,playedAt:endedAt},client);
        }
      }
      return getMatch(id, client);
    });
  }
  async function listMatches({ teamId, status, limit, offset } = {}) {
    limit = page(limit, 20, 100); offset = page(offset, 0, Number.MAX_SAFE_INTEGER);
    if (!limit) throw new StorageError('INVALID_PAGINATION', 'limit must be positive');
    if (status !== undefined && !['playing','finished','aborted'].includes(status)) throw new StorageError('INVALID_STATUS', 'Invalid status');
    const args = []; const clauses = [];
    if (teamId !== undefined) { args.push(teamId); clauses.push(`(m.team_a_id=$${args.length} OR m.team_b_id=$${args.length})`); }
    if (status !== undefined) { args.push(status); clauses.push(`m.status=$${args.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = Number((await query(`SELECT COUNT(*) AS total FROM matches m ${where}`, args)).rows[0].total);
    const rows = await query(`SELECT m.id,m.room_id,m.team_a_id,m.team_b_id,m.status,m.ranked,m.winner_id,m.reason,m.started_at,m.ended_at,
      a.name AS team_a_name,b.name AS team_b_name FROM matches m JOIN teams a ON a.id=m.team_a_id JOIN teams b ON b.id=m.team_b_id
      ${where} ORDER BY m.started_at DESC,m.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, limit, offset]);
    return { items: rows.rows.map(row => ({ ...row, started_at: new Date(row.started_at).toISOString(), ended_at: row.ended_at?.toISOString() ?? null })), total, limit, offset };
  }
  async function getReplay(id) {
    const match = await getMatch(id);
    const teams = await query('SELECT id,name FROM teams WHERE id=ANY($1::text[])', [[match.team_a_id, match.team_b_id]]);
    const names = Object.fromEntries(teams.rows.map(team => [team.id, team.name]));
    const side = value => value === match.team_a_id ? 'team_a' : value === match.team_b_id ? 'team_b' : value;
    function normalize(value) {
      if (Array.isArray(value)) return value.map(normalize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key,
        ['owner','player','team_id','winner_team','winner'].includes(key) ? side(val) :
        key === 'scores' ? Object.fromEntries(Object.entries(val).map(([team,score]) => [side(team),score])) : normalize(val)]));
    }
    const turns = (await query('SELECT * FROM match_turns WHERE match_id=$1 ORDER BY turn', [id])).rows.map(row => normalize({
      turn: row.turn, player: row.player, actions: row.actions, events: row.events, state: row.state }));
    return { match_info: { match_id: id, status: match.status, teams: { team_a: names[match.team_a_id], team_b: names[match.team_b_id] },
      team_ids: { team_a: match.team_a_id, team_b: match.team_b_id }, winner: side(match.winner_id), win_reason: match.reason,
      total_turns: turns.length, final_scores: { team_a: match.winner_id === match.team_a_id ? 1 : 0, team_b: match.winner_id === match.team_b_id ? 1 : 0 } },
      game_config: normalize(match.config), initial_state: normalize(match.initial_state), turns, final_state: normalize(match.final_state) };
  }
  async function getRankings() {
    const { rows } = await query(`SELECT t.id AS team_id,t.name,COUNT(m.id)::int AS played,
      COUNT(*) FILTER (WHERE m.winner_id=t.id)::int AS wins,
      COUNT(*) FILTER (WHERE m.id IS NOT NULL AND m.winner_id IS NULL)::int AS draws,
      COUNT(*) FILTER (WHERE m.winner_id IS NOT NULL AND m.winner_id<>t.id)::int AS losses
      FROM teams t LEFT JOIN matches m ON (m.team_a_id=t.id OR m.team_b_id=t.id) AND m.status='finished' AND m.ranked=TRUE
      GROUP BY t.id`).then(result => result);
    const ranked = rows.map(row => ({ ...row, points: row.wins * 3 + row.draws, win_rate: row.played ? row.wins / row.played : 0 }))
      .sort((a,b) => b.points-a.points || b.wins-a.wins || b.win_rate-a.win_rate || a.team_id.localeCompare(b.team_id));
    let rank = 0;
    return ranked.map((row,index) => { const previous = ranked[index-1]; if (!previous || row.points!==previous.points || row.wins!==previous.wins || row.win_rate!==previous.win_rate) rank=index+1; return { rank,...row }; });
  }
  async function listGames() { return (await query('SELECT id,name,default_config,active FROM games WHERE active=TRUE ORDER BY name,id')).rows; }
  async function upsertUser(user) {
    const id=required(user?.id,'user.id'), displayName=required(user?.display_name??user?.id,'user.display_name');
    const role=['player','organizer','admin'].includes(user.role)?user.role:'player';
    return (await query(`INSERT INTO users(id,display_name,avatar_url,role) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url
      RETURNING id,display_name,avatar_url,role,banned`,[id,displayName,user.avatar_url??null,role])).rows[0];
  }
  const mapAuthUser = row => row ? { ...row, guest:false, banned:Boolean(row.banned) } : null;
  async function getAuthUser(id) { return mapAuthUser((await query('SELECT id,display_name,avatar_url,email,phone,role,banned,password_salt,password_hash FROM users WHERE id=$1',[id])).rows[0]); }
  async function findAuthUser(identifier) { return mapAuthUser((await query('SELECT id,display_name,avatar_url,email,phone,role,banned,password_salt,password_hash FROM users WHERE email=$1 OR phone=$1',[identifier])).rows[0]); }
  async function createAuthUser(user) {
    const id=user.id??randomUUID();
    await query(`INSERT INTO users(id,display_name,avatar_url,email,phone,password_salt,password_hash,role)
      VALUES($1,$2,$3,$4,$5,$6,$7,'player')`,[id,user.display_name,user.avatar_url??null,user.email??null,user.phone??null,user.password_salt??null,user.password_hash??null]);
    return getAuthUser(id);
  }
  async function updateAuthPassword(id,salt,hash) { await query('UPDATE users SET password_salt=$1,password_hash=$2 WHERE id=$3',[salt,hash,id]); return getAuthUser(id); }
  async function getAuthIdentity(provider,providerUserId) { return (await query('SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_user_id=$2',[provider,providerUserId])).rows[0]??null; }
  async function addAuthIdentity({userId,provider,providerUserId,email=null}) { await query('INSERT INTO auth_identities(user_id,provider,provider_user_id,email) VALUES($1,$2,$3,$4)',[userId,provider,providerUserId,email]); return {user_id:userId,provider,provider_user_id:providerUserId,email}; }
  async function listAuthIdentities(userId) { return (await query('SELECT provider,email FROM auth_identities WHERE user_id=$1 ORDER BY provider',[userId])).rows; }
  async function saveAuthSession({tokenHash,userId,expiresAt}) { await query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[tokenHash,userId,new Date(expiresAt).toISOString()]); }
  async function getAuthSession(tokenHash) { const row=(await query('SELECT user_id,expires_at FROM auth_sessions WHERE token_hash=$1',[tokenHash])).rows[0]; return row?{userId:row.user_id,expiresAt:new Date(row.expires_at).getTime()}:null; }
  async function deleteAuthSession(tokenHash) { await query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash]); }
  async function listTournaments({ status, limit, offset } = {}) {
    limit=page(limit,20,100); offset=page(offset,0,Number.MAX_SAFE_INTEGER);
    if (!limit) throw new StorageError('INVALID_PAGINATION','limit must be positive');
    if (status!==undefined && !['draft','open','in_progress','completed','cancelled'].includes(status)) throw new StorageError('INVALID_STATUS','Invalid tournament status');
    const args=status===undefined?[]:[status], where=status===undefined?'':`WHERE t.status=$1`;
    const total=Number((await query(`SELECT COUNT(*) AS total FROM tournaments t ${where}`,args)).rows[0].total);
    const rows=(await query(`SELECT t.id,t.game_id,g.name AS game_name,t.code,t.name,t.format,t.status,t.config,t.starts_at,t.champion_id,t.created_at,
      (SELECT COUNT(*)::int FROM tournament_entries e WHERE e.tournament_id=t.id) AS participant_count
      FROM tournaments t JOIN games g ON g.id=t.game_id ${where} ORDER BY t.starts_at NULLS LAST,t.created_at DESC,t.id
      LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,offset])).rows;
    return { items:rows.map(r=>({...r,starts_at:r.starts_at?.toISOString()??null,created_at:r.created_at.toISOString()})),total,limit,offset };
  }
  async function getTournament(id) {
    const row=(await query(`SELECT t.id,t.game_id,g.name AS game_name,t.code,t.name,t.format,t.status,t.config,t.starts_at,t.champion_id,t.created_at FROM tournaments t JOIN games g ON g.id=t.game_id WHERE t.id=$1 OR t.code=$1`,[id])).rows[0];
    if (!row) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    const rounds=(await query('SELECT id,round_no,status FROM tournament_rounds WHERE tournament_id=$1 ORDER BY round_no',[row.id])).rows;
    for(const round of rounds) round.matches=(await query(`SELECT id,match_id,participant_a_id,participant_a_name,participant_b_id,
      participant_b_name,winner_id,result,played_at FROM tournament_match_history WHERE round_id=$1 ORDER BY played_at,id`,[round.id])).rows;
    const entries=(await query('SELECT e.user_id,u.display_name,e.seed,e.points FROM tournament_entries e JOIN users u ON u.id=e.user_id WHERE e.tournament_id=$1 ORDER BY e.seed,u.display_name',[row.id])).rows;
    const champion=row.champion_id?(await query(`SELECT CASE WHEN winner_id=participant_a_id THEN participant_a_name ELSE participant_b_name END AS name
      FROM tournament_match_history WHERE tournament_id=$1 AND winner_id=$2 ORDER BY played_at DESC LIMIT 1`,[row.id,row.champion_id])).rows[0]:null;
    return {...row,starts_at:row.starts_at?.toISOString()??null,created_at:row.created_at.toISOString(),champion:champion?{id:row.champion_id,name:champion.name}:null,rounds,entries};
  }
  async function createTournament({ id=randomUUID(),gameId,code,name,format,config={},startsAt=null }) {
    gameId=required(gameId,'gameId'); code=required(code,'code').toUpperCase(); name=required(name,'name');
    if (!/^[A-Z0-9-]{3,24}$/.test(code)||name.length>100||!['single_elimination','round_robin','swiss'].includes(format)||!config||typeof config!=='object'||Array.isArray(config)) throw new StorageError('INVALID_INPUT','Invalid tournament data');
    try { await query(`INSERT INTO tournaments(id,game_id,code,name,format,config,starts_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[id,gameId,code,name,format,JSON.stringify(config),startsAt===null?null:iso(startsAt)]); }
    catch(error){ if(error.code==='23503') throw new StorageError('GAME_NOT_FOUND','Game not found',404); if(error.code==='23505') throw new StorageError('TOURNAMENT_EXISTS','Tournament code already exists',409); throw error; }
    return getTournament(id);
  }
  async function createTournamentRound(tournamentId,{id=randomUUID(),roundNo}) {
    if(!Number.isSafeInteger(roundNo)||roundNo<1) throw new StorageError('INVALID_INPUT','roundNo must be a positive integer');
    try { return (await query('INSERT INTO tournament_rounds(id,tournament_id,round_no) VALUES($1,$2,$3) RETURNING id,tournament_id,round_no,status',[id,tournamentId,roundNo])).rows[0]; }
    catch(error){ if(error.code==='23503') throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404); if(error.code==='23505') throw new StorageError('ROUND_EXISTS','Round number already exists',409); throw error; }
  }
  async function recordTournamentMatchInternal({id=randomUUID(),tournamentId,roundId,matchId=null,participantAId,participantAName,
    participantBId,participantBName,winnerId=null,result=null,playedAt},client=pool) {
    tournamentId=required(tournamentId,'tournamentId');roundId=required(roundId,'roundId');
    participantAId=required(participantAId,'participantAId');participantBId=required(participantBId,'participantBId');
    participantAName=required(participantAName??participantAId,'participantAName');participantBName=required(participantBName??participantBId,'participantBName');
    if(participantAId===participantBId||(winnerId!==null&&![participantAId,participantBId].includes(winnerId)))throw new StorageError('INVALID_TOURNAMENT_RESULT','Invalid participants or winner');
    if(!(await query('SELECT id FROM tournament_rounds WHERE id=$1 AND tournament_id=$2',[roundId,tournamentId],client)).rows[0])throw new StorageError('ROUND_NOT_FOUND','Tournament round not found',404);
    const sql=`INSERT INTO tournament_match_history(id,tournament_id,round_id,match_id,participant_a_id,participant_a_name,participant_b_id,participant_b_name,winner_id,result,played_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) ON CONFLICT(match_id) DO UPDATE SET winner_id=EXCLUDED.winner_id,result=EXCLUDED.result,played_at=EXCLUDED.played_at
      RETURNING id,tournament_id,round_id,match_id,participant_a_id,participant_a_name,participant_b_id,participant_b_name,winner_id,result,played_at`;
    return (await query(sql,[id,tournamentId,roundId,matchId,participantAId,participantAName,participantBId,participantBName,winnerId,result===null?null:JSON.stringify(result),iso(playedAt)],client)).rows[0];
  }
  async function recordTournamentMatch(input) { return transaction(client=>recordTournamentMatchInternal(input,client)); }
  async function addTournamentEntry(tournamentId,{userId,seed=null}) {
    userId=required(userId,'userId'); if(seed!==null&&(!Number.isSafeInteger(seed)||seed<1)) throw new StorageError('INVALID_INPUT','seed must be a positive integer');
    return transaction(async client=>{
      const tournament=(await query('SELECT status FROM tournaments WHERE id=$1 FOR UPDATE',[tournamentId],client)).rows[0];
      if(!tournament)throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
      if(tournament.status!=='open')throw new StorageError('TOURNAMENT_NOT_OPEN','Tournament is not accepting entries',409);
      try{return (await query('INSERT INTO tournament_entries(tournament_id,user_id,seed) VALUES($1,$2,$3) RETURNING tournament_id,user_id,seed,points',[tournamentId,userId,seed],client)).rows[0];}
      catch(error){if(error.code==='23503')throw new StorageError('USER_NOT_FOUND','User not found',404);if(error.code==='23505')throw new StorageError('ENTRY_EXISTS','User already joined this tournament',409);throw error;}
    });
  }
  async function updateTournamentStatus(id,status,championId=null) {
    const transitions={draft:['open','cancelled'],open:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]};
    const current=(await query('SELECT status FROM tournaments WHERE id=$1',[id])).rows[0];
    if(!current)throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    if(!transitions[current.status]?.includes(status))throw new StorageError('INVALID_STATUS_TRANSITION','Tournament status transition is not allowed',409);
    if(status==='completed') {
      if(!championId) {
        const round=(await query('SELECT id FROM tournament_rounds WHERE tournament_id=$1 ORDER BY round_no DESC LIMIT 1',[id])).rows[0];
        const winners=round?(await query('SELECT DISTINCT winner_id FROM tournament_match_history WHERE round_id=$1 AND winner_id IS NOT NULL',[round.id])).rows:[];
        if(winners.length===1)championId=winners[0].winner_id;
      }
      if(!championId)throw new StorageError('CHAMPION_REQUIRED','A completed tournament must have a champion');
      if(!(await query('SELECT id FROM tournament_match_history WHERE tournament_id=$1 AND winner_id=$2',[id,championId])).rows[0])throw new StorageError('INVALID_CHAMPION','Champion must have won a recorded tournament match');
    } else if(championId) throw new StorageError('INVALID_INPUT','Champion can only be set when completing a tournament');
    await query('UPDATE tournaments SET status=$1,champion_id=$2 WHERE id=$3',[status,status==='completed'?championId:null,id]); return getTournament(id);
  }
  async function saveBotSubmission({id=randomUUID(),roomId,teamId,filename,source}) {
    roomId=required(roomId,'roomId');teamId=required(teamId,'teamId');filename=required(filename,'filename');required(source,'source');
    const hash=createHash('sha256').update(source,'utf8').digest('hex');
    try{return (await query('INSERT INTO bot_submissions(id,room_id,team_id,filename,source,source_sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,room_id,team_id,filename,source_sha256,created_at',[id,roomId,teamId,filename,source,hash])).rows[0];}
    catch(error){if(error.code==='23503')throw new StorageError('TEAM_NOT_FOUND','Team not found',404);throw error;}
  }
  async function listBotSubmissions({roomId,teamId,limit,offset}={}) {
    limit=page(limit,20,100);offset=page(offset,0,Number.MAX_SAFE_INTEGER);if(!limit)throw new StorageError('INVALID_PAGINATION','limit must be positive');
    const args=[],clauses=[];if(roomId!==undefined){args.push(roomId);clauses.push(`room_id=$${args.length}`);}if(teamId!==undefined){args.push(teamId);clauses.push(`team_id=$${args.length}`);}const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
    const total=Number((await query(`SELECT COUNT(*) AS total FROM bot_submissions ${where}`,args)).rows[0].total);
    const items=(await query(`SELECT id,room_id,team_id,filename,source_sha256,created_at FROM bot_submissions ${where} ORDER BY created_at DESC,id DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,offset])).rows;
    return {items:items.map(r=>({...r,created_at:r.created_at.toISOString()})),total,limit,offset};
  }
  async function getBotSubmission(id,roomId,teamId) {
    const row=(await query('SELECT id,room_id,team_id,filename,source,source_sha256,created_at FROM bot_submissions WHERE id=$1 AND room_id=$2 AND team_id=$3',[id,roomId,teamId])).rows[0];
    if(!row)throw new StorageError('SUBMISSION_NOT_FOUND','Bot submission not found',404);return {...row,created_at:row.created_at.toISOString()};
  }
  async function abortInterruptedMatches() {
    return Number((await query(`UPDATE matches SET status='aborted',reason='SERVER_RESTART',ended_at=now() WHERE status='playing'`)).rowCount);
  }
  async function importReplay(replay,{roomId='offline',gameId='rps_chess',mode,roundId=null,ranked=true,teamAId,teamBId,startedAt,endedAt}={}) {
    const info=replay?.match_info, board=replay?.game_config?.board;
    if(!info||!board||!Number.isInteger(board.width)||board.width<1||!Number.isInteger(board.height)||board.height<1||!Array.isArray(replay.initial_state)||!Array.isArray(replay.turns))throw new StorageError('INVALID_REPLAY','Replay requires match_info, board, initial_state and turns');
    const a=required(teamAId??info.team_ids?.team_a??info.teams?.team_a,'teamAId'),b=required(teamBId??info.team_ids?.team_b??info.teams?.team_b,'teamBId');
    const resolveTeam=value=>value==='team_a'?a:value==='team_b'?b:value;const winner=resolveTeam(info.winner),draw=info.winner===null&&info.win_reason==='DRAW';
    if(!draw&&![a,b].includes(winner))throw new StorageError('INVALID_REPLAY','Replay must have a participant winner or explicit DRAW');
    const ending=replay.turns.flatMap(turn=>turn.events??[]).filter(event=>event.type==='GAME_OVER').at(-1);
    if(ending&&(resolveTeam(ending.winner_team??ending.winner??null)!==(winner??null)||(ending.reason!=null&&ending.reason!==info.win_reason)))throw new StorageError('INVALID_REPLAY','GAME_OVER disagrees with match_info');
    return transaction(async client=>{
      const match=await startMatch({id:required(info.match_id,'match_id'),roomId,gameId,mode,roundId,teamA:{id:a,name:info.teams?.team_a??a},teamB:{id:b,name:info.teams?.team_b??b},ranked,config:replay.game_config,initialState:replay.initial_state,startedAt:startedAt??info.started_at},client);
      let frames=createFrames(replay);const pieces=()=>Object.values(frames.at(-1).pieces).filter(piece=>piece.alive).map(({alive,...piece})=>piece);
      for(const turn of replay.turns){frames=appendReplayTurn(frames,turn);await appendTurnInTransaction(client,match.id,{...turn,player:resolveTeam(turn.player??null),state:turn.state??pieces()});}
      return finishInTransaction(client,match.id,{winner:winner??null,draw,reason:info.win_reason??null},replay.final_state??pieces(),endedAt??info.ended_at);
    });
  }
  async function appendTurnInTransaction(client,id,turn) {
    if(!Number.isSafeInteger(turn.turn)||turn.turn<0||!Array.isArray(turn.actions??[])||!Array.isArray(turn.events??[]))throw new StorageError('INVALID_INPUT','Invalid turn, actions or events');
    const match=await getMatch(id,client,true);if(match.status!=='playing')throw new StorageError('MATCH_CLOSED','Match is closed',409);
    if(turn.player!=null&&![match.team_a_id,match.team_b_id].includes(turn.player))throw new StorageError('INVALID_INPUT','Player is not a match participant');
    const last=(await query('SELECT MAX(turn) AS turn FROM match_turns WHERE match_id=$1',[id],client)).rows[0].turn;
    if(last!==null&&turn.turn<=Number(last))throw new StorageError('STALE_TURN','Turn must increase',409);
    await query('INSERT INTO match_turns(match_id,turn,player,actions,events,state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)',[id,turn.turn,turn.player??null,JSON.stringify(turn.actions??[]),JSON.stringify(turn.events??[]),JSON.stringify(turn.state??null)],client);
    await query('UPDATE matches SET final_state=$1::jsonb WHERE id=$2',[JSON.stringify(turn.state??null),id],client);
  }
  async function finishInTransaction(client,id,result,finalState,endedAt) {
    const match=await getMatch(id,client,true);if(match.status!=='playing')return match;
    const winner=result?.winner_team??result?.winner??null;if(winner!==null&&![match.team_a_id,match.team_b_id].includes(winner))throw new StorageError('INVALID_WINNER','Winner must be a participant');
    const status=winner!==null||result?.draw===true?'finished':'aborted';
    await query('UPDATE matches SET status=$1,winner_id=$2,reason=$3,ended_at=$4,result=$5::jsonb,final_state=$6::jsonb WHERE id=$7',[status,winner,result?.reason??null,iso(endedAt),JSON.stringify(result),JSON.stringify(finalState===undefined?match.final_state:finalState),id],client);
    return getMatch(id,client);
  }
  return { initialize, registerTeam, startMatch, appendTurn, finishMatch, getMatch, listMatches, getReplay, getRankings,
    listGames, upsertUser, getAuthUser, findAuthUser, createAuthUser, updateAuthPassword, getAuthIdentity, addAuthIdentity,
    listAuthIdentities, saveAuthSession, getAuthSession, deleteAuthSession, listTournaments, getTournament, createTournament, createTournamentRound, addTournamentEntry,
    recordTournamentMatch, updateTournamentStatus, saveBotSubmission, listBotSubmissions, getBotSubmission, importReplay,
    abortInterruptedMatches, close:()=>pool.end() };
}
