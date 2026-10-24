import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createFrames, appendTurn as appendReplayTurn } from '../../src/utils/replayEngine.js';
import { StorageError } from './matchStore.js';
import { assertRegistrationWindowOpen, assertRegistrationClosed } from './registrationWindow.js';
import { normalizeSearchText, searchTermMatches } from './searchText.js';
import { BYE_ID, BYE_NAME, buildBracket, nextSlotOf, pairFirstRound, planSize, slotCount } from './tournamentBracket.js';

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
  async function addTeamMember(teamId, userId, role = 'member', client = pool) {
    teamId = required(teamId, 'teamId'); userId = required(userId, 'userId');
    if (!['captain','member'].includes(role)) throw new StorageError('INVALID_INPUT','role must be captain or member');
    try {
      return (await query(`INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,$3)
        ON CONFLICT(team_id,user_id) DO UPDATE SET role=EXCLUDED.role
        RETURNING team_id,user_id,role,joined_at`,[teamId,userId,role],client)).rows[0];
    } catch(error) {
      if(error.code==='23503') throw new StorageError('TEAM_OR_USER_NOT_FOUND','Team or user not found',404);
      throw error;
    }
  }
  async function getTeamMembers(teamId, client = pool) {
    return (await query(`SELECT tm.team_id,tm.user_id,tm.role,tm.joined_at,u.display_name,u.avatar_url
      FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 ORDER BY tm.joined_at`,[teamId],client)).rows;
  }
  async function getTeam(teamId, client = pool) {
    const team = (await query('SELECT id,name,created_at FROM teams WHERE id=$1',[teamId],client)).rows[0];
    if(!team) throw new StorageError('TEAM_NOT_FOUND','Team not found',404);
    team.members = await getTeamMembers(teamId, client);
    return team;
  }
  async function getMatch(id, client = pool, lock = false) {
    const row = (await query(`SELECT * FROM matches WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id], client)).rows[0];
    if (!row) throw new StorageError('MATCH_NOT_FOUND', 'Match not found', 404);
    return mapMatch(row);
  }
  async function startMatch({ id = randomUUID(), roomId, gameId = 'rps_chess', mode, roundId = null,
    teamA, teamB, ranked = true, config = {}, initialState = null, startedAt, scheduledAt = null, autoStart = true }, client = pool) {
    id = required(id, 'match.id'); roomId = required(roomId, 'roomId');
    gameId = required(gameId, 'gameId'); mode ??= ranked ? 'ranked' : 'casual';
    if (!teamA || !teamB || teamA.id === teamB.id || typeof ranked !== 'boolean' ||
      !['casual','ranked','tournament'].includes(mode) || (mode === 'ranked' && !ranked) || (mode === 'casual' && ranked))
      throw new StorageError('INVALID_INPUT', 'Two distinct teams and a valid match mode are required');
    await registerTeam(teamA, client); await registerTeam(teamB, client);
    try {
      await query(`INSERT INTO matches(id,room_id,game_id,mode,round_id,team_a_id,team_b_id,status,ranked,started_at,scheduled_at,auto_start,config,initial_state,final_state)
        VALUES($1,$2,$3,$4,$5,$6,$7,'playing',$8,$9,$10,$11,$12::jsonb,$13::jsonb,$13::jsonb)`,
      [id, roomId, gameId, mode, roundId, teamA.id, teamB.id, ranked, iso(startedAt),
       scheduledAt ? iso(scheduledAt) : null, autoStart, JSON.stringify(config), JSON.stringify(initialState)], client);
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
          // Lấy tên hiển thị chuẩn: tên User (nếu Đơn) hoặc tên Đội (nếu Đội)
          // Ưu tiên tra cứu từ tournament_entries, fallback sang tên đội từ bảng teams
          const names=(await query(`SELECT e.team_id,e.user_id,
            COALESCE(t.name, u.display_name) AS display_name
            FROM tournament_entries e
            LEFT JOIN users u ON u.id=e.user_id
            LEFT JOIN teams t ON t.id=e.team_id
            WHERE e.tournament_id=$1 AND (e.user_id=$2 OR e.team_id=$2 OR e.user_id=$3 OR e.team_id=$3)`,
            [round.tournament_id, match.team_a_id, match.team_b_id],client)).rows;
          const byId={};
          for(const n of names){
            const id=n.team_id??n.user_id;
            byId[id]=n.display_name;
          }
          // Fallback: lấy tên từ bảng teams nếu không tìm thấy trong tournament_entries
          let aName=byId[match.team_a_id];
          let bName=byId[match.team_b_id];
          if(!aName) {
            const team=(await query('SELECT name FROM teams WHERE id=$1',[match.team_a_id],client)).rows[0];
            aName=team?.name??match.team_a_id;
          }
          if(!bName) {
            const team=(await query('SELECT name FROM teams WHERE id=$1',[match.team_b_id],client)).rows[0];
            bName=team?.name??match.team_b_id;
          }
          await recordTournamentMatchInternal({tournamentId:round.tournament_id,roundId:match.round_id,matchId:id,
            participantAId:match.team_a_id,participantAName:aName,participantBId:match.team_b_id,
            participantBName:bName,winnerId:winner,result,playedAt:endedAt},client);
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
      (SELECT COUNT(*)::int FROM tournament_entries e WHERE e.tournament_id=t.id) AS participant_count,
      (SELECT MAX(h.played_at) FROM tournament_match_history h WHERE h.tournament_id=t.id) AS ended_at
      FROM tournaments t JOIN games g ON g.id=t.game_id ${where} ORDER BY t.starts_at NULLS LAST,t.created_at DESC,t.id
      LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,offset])).rows;
    return { items:rows.map(r=>({...r,starts_at:r.starts_at?.toISOString()??null,ended_at:r.ended_at?.toISOString()??null,created_at:r.created_at.toISOString()})),total,limit,offset };
  }
  async function listTournamentEntries(tournamentId, client = pool) {
    const entries = (await query(`SELECT e.tournament_id,e.user_id,e.team_id,e.seed,e.points,e.bot_submission_id,
      u.display_name AS user_display_name,u.avatar_url,u.role,
      t.name AS team_name
      FROM tournament_entries e
      LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN teams t ON t.id=e.team_id
      WHERE e.tournament_id=$1
      ORDER BY e.seed IS NULL,e.seed,COALESCE(t.name,u.display_name)`,[tournamentId],client)).rows;
    return entries.map(e => ({
      ...e,
      display_name: e.team_name ?? e.user_display_name,
    }));
  }
  async function listTournamentRounds(tournamentId, client = pool) {
    const rounds=(await query('SELECT id,round_no,status,scheduled_at,auto_start,submission_started_at,submission_deadline FROM tournament_rounds WHERE tournament_id=$1 ORDER BY round_no',[tournamentId],client)).rows;
    for(const round of rounds) round.scheduled_at=round.scheduled_at?new Date(round.scheduled_at).toISOString():null;
    for(const round of rounds) round.submission_started_at=round.submission_started_at?new Date(round.submission_started_at).toISOString():null;
    for(const round of rounds) round.submission_deadline=round.submission_deadline?new Date(round.submission_deadline).toISOString():null;
    for(const round of rounds) round.matches=(await query(`SELECT id,match_id,slot_index,round_id,participant_a_id,participant_a_name,participant_b_id,
      participant_b_name,winner_id,result,played_at FROM tournament_match_history WHERE round_id=$1 ORDER BY slot_index,id`,[round.id],client)).rows
      .map(row=>({...row,played_at:row.played_at instanceof Date?row.played_at.toISOString():row.played_at}));
    return rounds;
  }
  async function getTournament(id) {
    const row=(await query(`SELECT t.id,t.game_id,g.name AS game_name,t.code,t.name,t.format,t.status,t.config,t.starts_at,t.champion_id,t.created_at,
      (SELECT MAX(h.played_at) FROM tournament_match_history h WHERE h.tournament_id=t.id) AS ended_at
      FROM tournaments t JOIN games g ON g.id=t.game_id WHERE t.id=$1 OR t.code=$1`,[id])).rows[0];
    if (!row) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    const rounds=await listTournamentRounds(row.id);
    const entries=await listTournamentEntries(row.id);
    const champion=row.champion_id?(await query(`SELECT CASE WHEN winner_id=participant_a_id THEN participant_a_name ELSE participant_b_name END AS name
      FROM tournament_match_history WHERE tournament_id=$1 AND winner_id=$2 ORDER BY played_at DESC LIMIT 1`,[row.id,row.champion_id])).rows[0]:null;
    return {...row,starts_at:row.starts_at?.toISOString()??null,ended_at:row.ended_at?.toISOString()??null,created_at:row.created_at.toISOString(),champion:champion?{id:row.champion_id,name:champion.name}:null,
      participant_count:entries.length,rounds,entries,bracket:row.format==='single_elimination'?buildBracket({rounds,entryCount:entries.length}):null};
  }
  async function listTournamentNotifications(userId,{limit=100,offset=0}={}) {
    userId=required(userId,'userId');limit=page(limit,100,200);offset=page(offset,0,Number.MAX_SAFE_INTEGER);
    if(!limit)throw new StorageError('INVALID_PAGINATION','limit must be positive');
    const ids=(await query('SELECT id FROM tournaments')).rows.map(row=>row.id), events=[];
    const dateText=value=>value?new Date(value).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'}):null;
    for(const id of ids){
      const tournament=await getTournament(id),recipients=new Set(),eventStart=events.length;
      if(tournament.config?.organizerId)recipients.add(tournament.config.organizerId);
      for(const entry of tournament.entries){if(entry.user_id)recipients.add(entry.user_id);if(entry.team_id)for(const member of await getTeamMembers(entry.team_id))recipients.add(member.user_id);}
      if(['draft','open','in_progress'].includes(tournament.status)){
        const phase=tournament.status==='in_progress'?'đang diễn ra':tournament.status==='draft'?'dự kiến':'sắp diễn ra';
        events.push({key:`tournament:schedule:${tournament.status}`,type:'schedule',title:`${tournament.name} — ${phase}`,message:`Giải ${tournament.name} ${phase}${tournament.starts_at?`, bắt đầu lúc ${dateText(tournament.starts_at)}`:''}.`,scheduled:tournament.starts_at});
      }
      if(recipients.has(userId)&&tournament.status==='completed')events.push({key:'tournament:completed',type:'status',title:`${tournament.name} đã kết thúc`,message:`Giải đấu đã kết thúc${tournament.champion?.name?`. Nhà vô địch: ${tournament.champion.name}.`:'.'}`});
      if(!recipients.has(userId))continue;
      for(const round of tournament.rounds)for(const match of round.matches){
        let isA=match.participant_a_id===userId,isB=match.participant_b_id===userId;
        for(const entry of tournament.entries)if(entry.team_id&&(entry.team_id===match.participant_a_id||entry.team_id===match.participant_b_id)){
          if((await getTeamMembers(entry.team_id)).some(member=>member.user_id===userId)){if(entry.team_id===match.participant_a_id)isA=true;if(entry.team_id===match.participant_b_id)isB=true;}
        }
        if(!isA&&!isB)continue;
        const opponent=isA?match.participant_b_name:match.participant_a_name,label=`Vòng ${round.round_no} — ${tournament.name}`;
        if(!match.winner_id)events.push({key:`match:${match.id}:scheduled`,type:'match',title:`${label}: trận cần tham gia`,message:`Bạn sẽ đấu với ${opponent}${round.scheduled_at?` lúc ${dateText(round.scheduled_at)}`:''}.`,scheduled:round.scheduled_at,metadata:{roundNo:round.round_no,matchId:match.match_id}});
        else{const won=match.winner_id===(isA?match.participant_a_id:match.participant_b_id);events.push({key:`match:${match.id}:result`,type:'result',title:`${label}: ${won?'chiến thắng':'thất bại'}`,message:`Bạn ${won?'thắng':'thua'} trước ${opponent}${match.played_at?` (${dateText(match.played_at)})`:''}.`,scheduled:match.played_at,metadata:{roundNo:round.round_no,matchId:match.match_id,winnerId:match.winner_id}});}
      }
      for(let i=eventStart;i<events.length;i++)events[i].tournamentId=tournament.id;
    }
    for(const event of events)await query(`INSERT INTO tournament_notifications(id,user_id,tournament_id,event_key,type,title,message,scheduled_at,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(user_id,event_key) DO UPDATE SET tournament_id=EXCLUDED.tournament_id,
      type=EXCLUDED.type,title=EXCLUDED.title,message=EXCLUDED.message,scheduled_at=EXCLUDED.scheduled_at,metadata=EXCLUDED.metadata`,
      [randomUUID(),userId,event.tournamentId,event.key,event.type,event.title,event.message,event.scheduled??null,JSON.stringify(event.metadata??{})]);
    const counts=(await query('SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM tournament_notifications WHERE user_id=$1',[userId])).rows[0];
    const rows=(await query(`SELECT n.id,n.user_id,n.tournament_id,t.game_id,n.event_key,n.type,n.title,n.message,n.scheduled_at,n.metadata,n.created_at,n.read_at
      FROM tournament_notifications n LEFT JOIN tournaments t ON t.id=n.tournament_id
      WHERE n.user_id=$1 ORDER BY COALESCE(n.scheduled_at,n.created_at) DESC,n.created_at DESC LIMIT $2 OFFSET $3`,[userId,limit,offset])).rows;
    return {items:rows.map(row=>({...row,scheduled_at:row.scheduled_at?.toISOString()??null,created_at:row.created_at.toISOString(),read_at:row.read_at?.toISOString()??null})),total:counts.total,unread:counts.unread,limit,offset};
  }
  async function markTournamentNotificationRead(userId,notificationId){
    const row=(await query('UPDATE tournament_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',[notificationId,userId])).rows[0];
    if(!row)throw new StorageError('NOTIFICATION_NOT_FOUND','Notification not found',404);return {id:notificationId,read:true};
  }
  async function createTournament({ id=randomUUID(),gameId,code,name,format,config={},startsAt=null,status='open' }) {
    gameId=required(gameId,'gameId'); code=required(code,'code').toUpperCase(); name=required(name,'name');
    if (!/^[A-Z0-9-]{3,24}$/.test(code)||name.length>100||!['single_elimination','round_robin','swiss'].includes(format)||!['draft','open'].includes(status)||!config||typeof config!=='object'||Array.isArray(config)) throw new StorageError('INVALID_INPUT','Invalid tournament data');
    try { await query(`INSERT INTO tournaments(id,game_id,code,name,format,status,config,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[id,gameId,code,name,format,status,JSON.stringify(config),startsAt===null?null:iso(startsAt)]); }
    catch(error){ if(error.code==='23503') throw new StorageError('GAME_NOT_FOUND','Game not found',404); if(error.code==='23505') throw new StorageError('TOURNAMENT_EXISTS','Tournament code already exists',409); throw error; }
    return getTournament(id);
  }
  async function createTournamentRound(tournamentId,{id=randomUUID(),roundNo,scheduledAt=null,autoStart=true}) {
    if(!Number.isSafeInteger(roundNo)||roundNo<1) throw new StorageError('INVALID_INPUT','roundNo must be a positive integer');
    try { return (await query('INSERT INTO tournament_rounds(id,tournament_id,round_no,scheduled_at,auto_start) VALUES($1,$2,$3,$4,$5) RETURNING id,tournament_id,round_no,status,scheduled_at,auto_start',
      [id,tournamentId,roundNo,scheduledAt?iso(scheduledAt):null,autoStart])).rows[0]; }
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
  async function addTournamentEntry(tournamentId,{userId=null,teamId=null,seed=null,botSubmissionId=null}) {
    if(!userId && !teamId) throw new StorageError('INVALID_INPUT','Either userId or teamId is required');
    if(seed!==null&&(!Number.isSafeInteger(seed)||seed<1)) throw new StorageError('INVALID_INPUT','seed must be a positive integer');
    return transaction(async client=>{
      const tournament=(await query('SELECT id,status,config FROM tournaments WHERE id=$1 FOR UPDATE',[tournamentId],client)).rows[0];
      if(!tournament)throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
      if(tournament.status!=='open')throw new StorageError('TOURNAMENT_NOT_OPEN','Tournament is not accepting entries',409);
      const config=tournament.config??{};
      assertRegistrationWindowOpen(config);
      const participantMode=config.participantMode??'INDIVIDUAL';
      if(participantMode==='TEAM' && !teamId) throw new StorageError('INVALID_INPUT','Team mode requires a teamId');
      if(participantMode==='INDIVIDUAL' && !userId) throw new StorageError('INVALID_INPUT','Individual mode requires a userId');
      // Seed mặc định = thứ tự đăng ký, dùng để xếp nhánh đấu.
      seed ??= Number((await query('SELECT COUNT(*)::int AS total FROM tournament_entries WHERE tournament_id=$1',[tournamentId],client)).rows[0].total)+1;
      try{
        if(teamId) {
          return (await query('INSERT INTO tournament_entries(tournament_id,user_id,team_id,seed,bot_submission_id) VALUES($1,$2,$3,$4,$5) RETURNING tournament_id,user_id,team_id,seed,points,bot_submission_id',
            [tournamentId,userId,teamId,seed,botSubmissionId],client)).rows[0];
        }
        return (await query('INSERT INTO tournament_entries(tournament_id,user_id,seed) VALUES($1,$2,$3) RETURNING tournament_id,user_id,seed,points',
          [tournamentId,userId,seed],client)).rows[0];
      }
      catch(error){
        if(error.code==='23503'){
          if(teamId) throw new StorageError('TEAM_NOT_FOUND','Team not found',404);
          throw new StorageError('USER_NOT_FOUND','User not found',404);
        }
        if(error.code==='23505')throw new StorageError('ENTRY_EXISTS','User already joined this tournament',409);
        throw error;
      }
    });
  }
  async function setEntrySubmission(tournamentId,{userId=null,teamId=null,submissionId}) {
    if(!teamId && !userId) throw new StorageError('INVALID_INPUT','teamId or userId is required');
    if(!submissionId) throw new StorageError('INVALID_INPUT','submissionId is required');
    const result=await query(`UPDATE tournament_entries SET bot_submission_id=$1
      WHERE tournament_id=$2 AND (team_id=$3 OR user_id=$4)
      RETURNING tournament_id,user_id,team_id,bot_submission_id`,
      [submissionId,tournamentId,teamId,userId]);
    if(!result.rows[0]) throw new StorageError('ENTRY_NOT_FOUND','Tournament entry not found',404);
    return result.rows[0];
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
  async function insertHistorySlot({tournamentId,roundId,slotIndex,a,b,winnerId=null,result=null,matchId=null,playedAt},client=pool) {
    return (await query(`INSERT INTO tournament_match_history(id,tournament_id,round_id,match_id,slot_index,participant_a_id,participant_a_name,
      participant_b_id,participant_b_name,winner_id,result,played_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      RETURNING id,tournament_id,round_id,match_id,slot_index,participant_a_id,participant_a_name,participant_b_id,participant_b_name,winner_id,result,played_at`,
      [randomUUID(),tournamentId,roundId,matchId,slotIndex,a.id,a.name,b.id,b.name,winnerId,result===null?null:JSON.stringify(result),iso(playedAt)],client)).rows[0];
  }
  async function promoteWinner({tournamentId,roundIds,totalRounds,roundNo,slotIndex,winner},client=pool) {
    if(roundNo>=totalRounds) return;
    const next=nextSlotOf(roundNo,slotIndex);
    const siblingIndex=next.slotIndex*2+(next.side==='a'?1:0);
    const sibling=(await query('SELECT winner_id,participant_a_id,participant_a_name,participant_b_id,participant_b_name FROM tournament_match_history WHERE round_id=$1 AND slot_index=$2',[roundIds[roundNo-1],siblingIndex],client)).rows[0];
    if(!sibling?.winner_id) return;
    const exists=(await query('SELECT id FROM tournament_match_history WHERE round_id=$1 AND slot_index=$2',[roundIds[next.roundNo-1],next.slotIndex],client)).rows[0];
    if(exists) return;
    const other={id:sibling.winner_id,name:sibling.winner_id===sibling.participant_a_id?sibling.participant_a_name:sibling.participant_b_name};
    if(other.id===winner.id) return;
    await insertHistorySlot({tournamentId,roundId:roundIds[next.roundNo-1],slotIndex:next.slotIndex,
      a:next.side==='a'?winner:other,b:next.side==='b'?winner:other,playedAt:new Date().toISOString()},client);
  }
  async function refreshRoundStatuses({tournamentId,totalRounds,entryCount},client=pool) {
    for(let roundNo=1;roundNo<=totalRounds;roundNo+=1){
      const round=(await query('SELECT id, submission_started_at FROM tournament_rounds WHERE tournament_id=$1 AND round_no=$2',[tournamentId,roundNo],client)).rows[0];
      if(!round) continue;
      const rows=(await query('SELECT winner_id FROM tournament_match_history WHERE round_id=$1',[round.id],client)).rows;
      const expected=slotCount(entryCount,roundNo);
      const decided=rows.filter(row=>row.winner_id).length;
      // Chỉ tính là đang diễn ra khi cửa sổ nộp code đã mở; chưa mở vẫn chờ (pending).
      const status=rows.length>=expected&&decided>=expected?'completed':rows.length>0&&round.submission_started_at?'in_progress':'pending';
      await query('UPDATE tournament_rounds SET status=$1 WHERE id=$2',[status,round.id],client);
    }
  }
  async function generateTournamentBracket(tournamentId) {
    return transaction(async client=>{
      const tournament=(await query('SELECT id,format,status,config,starts_at FROM tournaments WHERE id=$1 FOR UPDATE',[tournamentId],client)).rows[0];
      if(!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
      if(tournament.format!=='single_elimination') throw new StorageError('FORMAT_NOT_SUPPORTED','Chỉ thể thức loại trực tiếp mới tạo được nhánh đấu',409);
      if(!['open','in_progress'].includes(tournament.status)) throw new StorageError('INVALID_STATUS_TRANSITION','Chỉ tạo được nhánh khi giải đang mở đăng ký hoặc đang diễn ra',409);
      assertRegistrationClosed(tournament.config??{});
      if((await query('SELECT id FROM tournament_rounds WHERE tournament_id=$1 LIMIT 1',[tournamentId],client)).rows[0]) throw new StorageError('BRACKET_EXISTS','Sơ đồ nhánh của giải đã được tạo trước đó',409);
      const rawEntries=await listTournamentEntries(tournamentId,client);
      const entries=rawEntries.map((entry,index)=>({
        id: entry.team_id ?? entry.user_id,
        name: entry.display_name,
        seed: entry.seed??index+1,
      }));
      if(entries.length<2) throw new StorageError('NOT_ENOUGH_PARTICIPANTS','Cần ít nhất 2 người đăng ký để tạo nhánh đấu',409);
      const {totalRounds}=planSize(entries.length);
      const config=tournament.config??{};
      const windowMinutes=Number(config.submissionWindowMinutes)||10;
      const nowIso=new Date().toISOString();
      const deadlineIso=new Date(Date.now()+windowMinutes*60*1000).toISOString();
      // Vòng 1 mở ngay theo ngày khởi tranh; các vòng sau chờ chủ giải đặt giờ hoặc bấm mở trong bảng điều khiển.
      const roundOneAt=tournament.starts_at?iso(tournament.starts_at):nowIso;
      const roundIds=[];
      for(let roundNo=1;roundNo<=totalRounds;roundNo+=1){
        const roundId=randomUUID();
        await query('INSERT INTO tournament_rounds(id,tournament_id,round_no,status,submission_started_at,submission_deadline,scheduled_at,auto_start) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [roundId,tournamentId,roundNo,roundNo===1?'in_progress':'pending',roundNo===1?iso(nowIso):null,roundNo===1?iso(deadlineIso):null,
            roundNo===1?roundOneAt:null,roundNo===1?true:false],client);
        roundIds.push(roundId);
      }
      const startedAt=new Date().toISOString();
      for(const [slotIndex,pair] of pairFirstRound(entries).entries()){
        const bye=!pair.a||!pair.b;
        const a=pair.a??{id:BYE_ID,name:BYE_NAME};
        const b=pair.b??{id:BYE_ID,name:BYE_NAME};
        const winner=bye?pair.a??pair.b:null;
        await insertHistorySlot({tournamentId,roundId:roundIds[0],slotIndex,a,b,winnerId:winner?.id??null,result:bye?{bye:true}:null,playedAt:startedAt},client);
        if(winner) await promoteWinner({tournamentId,roundIds,totalRounds,roundNo:1,slotIndex,winner},client);
      }
      await refreshRoundStatuses({tournamentId,totalRounds,entryCount:entries.length},client);
      // Chưa có lịch khởi tranh thì ghi nhận giờ khai mạc ngay lúc mở giải.
      await query('UPDATE tournaments SET starts_at = COALESCE(starts_at, $2) WHERE id=$1',[tournamentId,startedAt],client);
      if(tournament.status==='open') await query("UPDATE tournaments SET status='in_progress' WHERE id=$1",[tournamentId],client);
      return getTournament(tournamentId);
    });
  }
  async function attachSlotResult(tournamentId,{roundNo,slotIndex,matchId}) {
    matchId=required(matchId,'matchId');
    if(!Number.isSafeInteger(roundNo)||roundNo<1) throw new StorageError('INVALID_INPUT','roundNo must be a positive integer');
    if(!Number.isSafeInteger(slotIndex)||slotIndex<0) throw new StorageError('INVALID_INPUT','slotIndex must not be negative');
    return transaction(async client=>{
      const tournament=(await query('SELECT id,status FROM tournaments WHERE id=$1 FOR UPDATE',[tournamentId],client)).rows[0];
      if(!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
      if(tournament.status!=='in_progress') throw new StorageError('TOURNAMENT_NOT_RUNNING','Chỉ gắn được kết quả khi giải đang diễn ra',409);
      const match=await getMatch(matchId,client);
      if(match.status!=='finished') throw new StorageError('MATCH_NOT_FINISHED','Trận đấu chưa kết thúc nên chưa có kết quả',409);
      const entries=await listTournamentEntries(tournamentId,client);
      const rounds=await listTournamentRounds(tournamentId,client);
      const bracket=buildBracket({rounds,entryCount:entries.length});
      const slot=bracket.rounds[roundNo-1]?.[slotIndex];
      if(!slot) throw new StorageError('SLOT_NOT_FOUND','Không tìm thấy trận này trong nhánh đấu',404);
      if(slot.status==='bye') throw new StorageError('SLOT_IS_BYE','Trận này là bye, không cần kết quả',409);
      if(!slot.participantAId||!slot.participantBId) throw new StorageError('SLOT_NOT_READY','Chưa xác định đủ hai đấu thủ cho trận này',409);
      const players=[match.team_a_id,match.team_b_id];
      if(!players.includes(slot.participantAId)||!players.includes(slot.participantBId)) throw new StorageError('MATCH_MISMATCH','Trận đấu không diễn ra giữa hai đấu thủ của nhánh này',409);
      const round=rounds.find(item=>Number(item.round_no)===Number(roundNo));
      if(!round) throw new StorageError('ROUND_NOT_FOUND','Tournament round not found',404);
      const winnerId=match.winner_id??null;
      const result={draw:winnerId===null,reason:match.reason??null,source_match_id:match.id};
      const playedAt=match.ended_at??new Date().toISOString();
      const existing=(await query('SELECT id FROM tournament_match_history WHERE round_id=$1 AND slot_index=$2',[round.id,slotIndex],client)).rows[0];
      if(existing){
        await query(`UPDATE tournament_match_history SET match_id=$1,participant_a_id=$2,participant_a_name=$3,participant_b_id=$4,
          participant_b_name=$5,winner_id=$6,result=$7::jsonb,played_at=$8 WHERE id=$9`,
          [matchId,slot.participantAId,slot.participantAName,slot.participantBId,slot.participantBName,winnerId,JSON.stringify(result),iso(playedAt),existing.id],client);
      } else {
        await insertHistorySlot({tournamentId,roundId:round.id,slotIndex,matchId,playedAt,winnerId,result,
          a:{id:slot.participantAId,name:slot.participantAName},b:{id:slot.participantBId,name:slot.participantBName}},client);
      }
      if(winnerId){
        await promoteWinner({tournamentId,roundIds:rounds.map(item=>item.id),totalRounds:bracket.totalRounds,roundNo,slotIndex,
          winner:{id:winnerId,name:winnerId===slot.participantAId?slot.participantAName:slot.participantBName}},client);
      }
      await refreshRoundStatuses({tournamentId,totalRounds:bracket.totalRounds,entryCount:entries.length},client);
      if(winnerId&&roundNo===bracket.totalRounds) await query("UPDATE tournaments SET status='completed',champion_id=$1 WHERE id=$2",[winnerId,tournamentId],client);
      return getTournament(tournamentId);
    });
  }
  // Gợi ý nick: tìm gần đúng, không phân biệt hoa thường hay dấu.
  async function searchUsers(q, limit = 10) {
    const term = normalizeSearchText(q);
    if (!term) return { items: [] };
    const { rows } = await query(
      'SELECT id, display_name, avatar_url FROM users ORDER BY display_name LIMIT 1000',
    );
    // Bảng users của Postgres không có cột guest nên bổ sung giả để khớp shape của sqlite.
    return { items: rows.map((row) => ({ ...row, guest: false })).filter((row) => searchTermMatches(row.display_name, term)).slice(0, limit) };
  }

  async function getUserPublicProfile(id) {
    const user=(await query('SELECT id,display_name,avatar_url,role,created_at FROM users WHERE id=$1',[id])).rows[0];
    if(!user) throw new StorageError('USER_NOT_FOUND','User not found',404);
    const stats=(await query(`SELECT COUNT(*)::int AS played,
      COALESCE(SUM(CASE WHEN winner_id=$1 THEN 1 ELSE 0 END),0)::int AS wins,
      COALESCE(SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END),0)::int AS draws
      FROM matches WHERE status='finished' AND (team_a_id=$1 OR team_b_id=$1)`,[id])).rows[0];
    // created_at phải nằm trong danh sách SELECT của UNION thì mới dùng được trong ORDER BY.
    const tournaments=(await query(`SELECT DISTINCT t.id,t.code,t.name,t.status,t.starts_at,t.created_at FROM tournament_entries e
      JOIN tournaments t ON t.id=e.tournament_id WHERE e.user_id=$1
      UNION
      SELECT DISTINCT t.id,t.code,t.name,t.status,t.starts_at,t.created_at FROM tournament_entries e
      JOIN tournaments t ON t.id=e.tournament_id
      JOIN team_members tm ON tm.team_id=e.team_id AND tm.user_id=$1
      ORDER BY starts_at NULLS LAST,created_at DESC`,[id])).rows
      .map(({created_at,...row})=>({...row,starts_at:row.starts_at?.toISOString()??null}));
    return {...user,created_at:user.created_at instanceof Date?user.created_at.toISOString():user.created_at,
      stats:{played:stats.played,wins:stats.wins,draws:stats.draws,losses:stats.played-stats.wins-stats.draws},tournaments};
  }
  async function getBotSubmissionById(id) {
    if (!id) return null;
    const row=(await query('SELECT id,room_id,team_id,filename,source,source_sha256,created_at FROM bot_submissions WHERE id=$1',[id])).rows[0];
    if(!row)throw new StorageError('SUBMISSION_NOT_FOUND','Bot submission not found',404);
    return {...row,created_at:row.created_at instanceof Date?row.created_at.toISOString():row.created_at.toISOString()};
  }
  async function myEntryIdSet(tournamentId,userId) {
    const entries=await listTournamentEntries(tournamentId);
    const ids=new Set();
    const memberRows=(await query('SELECT team_id FROM team_members WHERE user_id=$1',[userId])).rows;
    for(const entry of entries){
      if(entry.user_id&&String(entry.user_id)===String(userId))ids.add(entry.user_id);
      if(entry.team_id&&memberRows.some(m=>m.team_id===entry.team_id))ids.add(entry.team_id);
    }
    return ids;
  }
  async function submissionOf(tournamentId,config,entryId,roundNo) {
    let submissionId=null;
    if(config.roundSubmissionMode==='PER_ROUND'){
      const row=(await query('SELECT submission_id FROM tournament_round_submissions WHERE tournament_id=$1 AND round_no=$2 AND entry_id=$3',[tournamentId,roundNo,entryId])).rows[0];
      submissionId=row?.submission_id??null;
    } else {
      const entry=(await query(`SELECT bot_submission_id FROM tournament_entries
        WHERE tournament_id=$1 AND (team_id=$2 OR (user_id=$2 AND team_id IS NULL))`,[tournamentId,entryId])).rows[0];
      submissionId=entry?.bot_submission_id??null;
    }
    if(!submissionId)return null;
    const row=await getBotSubmissionById(submissionId);
    return {id:row.id,filename:row.filename};
  }
  async function getTournamentMyMatch(tournamentId,userId) {
    userId=required(userId,'userId');
    const tournament=(await query('SELECT id,format,status,config FROM tournaments WHERE id=$1 OR code=$1',[tournamentId])).rows[0];
    if(!tournament)throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    const config=tournament.config??{};
    const myIds=await myEntryIdSet(tournament.id,userId);
    const rounds=await listTournamentRounds(tournament.id);
    for(const round of rounds){
      // Vòng chưa mở cửa sổ nộp code thì chưa tính là trận hiện tại.
      if(!round.submission_started_at) continue;
      for(const slot of round.matches){
        if(slot.winner_id||slot.match_id||!slot.participant_a_id||!slot.participant_b_id)continue;
        const meIsA=myIds.has(slot.participant_a_id);
        const meIsB=myIds.has(slot.participant_b_id);
        if(!meIsA&&!meIsB)continue;
        const me=meIsA?slot.participant_a_id:slot.participant_b_id;
        const opp=meIsA?slot.participant_b_id:slot.participant_a_id;
        const readyRows=(await query('SELECT participant_id,ready FROM tournament_readiness WHERE tournament_id=$1 AND round_no=$2 AND slot_index=$3',[tournament.id,round.round_no,slot.slot_index])).rows;
        const ready=new Map(readyRows.map(r=>[r.participant_id,Boolean(r.ready)]));
        const meSub=await submissionOf(tournament.id,config,me,round.round_no);
        const oppSub=await submissionOf(tournament.id,config,opp,round.round_no);
        const meReady=Boolean(ready.get(me));
        const oppReady=Boolean(ready.get(opp));
        return {
          found:true,tournamentId:tournament.id,tournamentStatus:tournament.status,
          roundNo:round.round_no,slotIndex:slot.slot_index,matchKey:`r${round.round_no}m${slot.slot_index}`,
          mode:config.roundSubmissionMode??'SINGLE',submissionWindowMinutes:config.submissionWindowMinutes??10,
          submissionStartedAt:round.submission_started_at??null,
          submissionDeadline:round.submission_deadline??null,
          me:{entryId:me,name:meIsA?slot.participant_a_name:slot.participant_b_name,ready:meReady,submitted:Boolean(meSub),submissionId:meSub?.id??null,filename:meSub?.filename??null},
          opponent:{entryId:opp,name:meIsA?slot.participant_b_name:slot.participant_a_name,ready:oppReady,submitted:Boolean(oppSub),submissionId:oppSub?.id??null,filename:oppSub?.filename??null},
          bothReady:meReady&&oppReady,matchId:slot.match_id??null,
        };
      }
    }
    return {found:false,tournamentId:tournament.id,tournamentStatus:tournament.status};
  }
  async function setTournamentReady(tournamentId,userId,{ready=true}={}) {
    const current=await getTournamentMyMatch(tournamentId,userId);
    if(!current.found)throw new StorageError('NO_ACTIVE_MATCH','Bạn chưa có trận đấu nào chờ sẵn sàng trong vòng hiện tại.',409);
    const config=(await query('SELECT config FROM tournaments WHERE id=$1',[current.tournamentId])).rows[0].config??{};
    if(ready&&current.mode==='PER_ROUND'&&!current.me.submitted)throw new StorageError('SUBMISSION_REQUIRED','Hãy nộp code cho vòng này trước khi bấm Sẵn sàng.');
    if(ready&&current.mode!=='PER_ROUND'&&!current.me.submissionId)throw new StorageError('SUBMISSION_REQUIRED','Bạn chưa đăng ký bot cho giải này.');
    await query(`INSERT INTO tournament_readiness(tournament_id,round_no,slot_index,participant_id,ready,updated_at)
      VALUES($1,$2,$3,$4,$5,now())
      ON CONFLICT(tournament_id,round_no,slot_index,participant_id) DO UPDATE SET ready=excluded.ready,updated_at=now()`,
      [current.tournamentId,current.roundNo,current.slotIndex,current.me.entryId,Boolean(ready)]);
    const refreshed=await getTournamentMyMatch(current.tournamentId,userId);
    refreshed.ready=Boolean(ready);
    refreshed.bothReady=refreshed.me.ready&&refreshed.opponent.ready;
    refreshed.matchStarting=refreshed.bothReady;
    return refreshed;
  }
  async function submitTournamentRoundBot(tournamentId,userId,roundNo,{filename,source}={}) {
    const tournament=(await query('SELECT id,status,config FROM tournaments WHERE id=$1 OR code=$1',[tournamentId])).rows[0];
    if(!tournament)throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    const config=tournament.config??{};
    if(config.roundSubmissionMode!=='PER_ROUND')throw new StorageError('INVALID_MODE','Giải không ở chế độ nộp bot theo vòng (PER_ROUND).');
    if(tournament.status!=='in_progress')throw new StorageError('INVALID_STATE','Giải chưa bắt đầu hoặc đã kết thúc.');
    if(!Number.isSafeInteger(roundNo)||roundNo<1)throw new StorageError('INVALID_INPUT','roundNo phải là số nguyên > 0');
    const myIds=await myEntryIdSet(tournament.id,userId);
    const round=(await query('SELECT round_no FROM tournament_rounds WHERE tournament_id=$1 AND round_no=$2',[tournament.id,roundNo])).rows[0];
    if(!round)throw new StorageError('ROUND_NOT_FOUND','Không tìm thấy vòng đấu này.');
    const entries=await listTournamentEntries(tournament.id);
    const entry=entries.find(e=>myIds.has(e.team_id??e.user_id));
    if(!entry)throw new StorageError('NOT_ENTRY','Bạn chưa đăng ký giải này.');
    const entryId=entry.team_id??entry.user_id;
    await registerTeam({id:entryId,name:entry.display_name??entryId});
    const saved=await saveBotSubmission({roomId:`t-${tournament.id}-r${roundNo}`,teamId:entryId,filename:filename??'bot.py',source});
    await query(`INSERT INTO tournament_round_submissions(tournament_id,round_no,entry_id,submission_id,created_at)
      VALUES($1,$2,$3,$4,now())
      ON CONFLICT(tournament_id,round_no,entry_id) DO UPDATE SET submission_id=excluded.submission_id,created_at=now()`,
      [tournament.id,roundNo,entryId,saved.id]);
    return {id:saved.id,filename:saved.filename,roundNo};
  }
  async function getTournamentSlot(tournamentId,roundNo,slotIndex) {
    const tournament=(await query('SELECT id,status,config FROM tournaments WHERE id=$1 OR code=$1',[tournamentId])).rows[0];
    if(!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
    if(!Number.isSafeInteger(roundNo)||roundNo<1||!Number.isSafeInteger(slotIndex)||slotIndex<0) throw new StorageError('INVALID_INPUT','roundNo/slotIndex không hợp lệ');
    const round=(await query('SELECT id,round_no,status FROM tournament_rounds WHERE tournament_id=$1 AND round_no=$2',[tournament.id,roundNo])).rows[0];
    if(!round) throw new StorageError('ROUND_NOT_FOUND','Không tìm thấy vòng đấu này.',404);
    const row=(await query(`SELECT id,match_id,participant_a_id,participant_a_name,participant_b_id,participant_b_name,winner_id
      FROM tournament_match_history WHERE round_id=$1 AND slot_index=$2`,[round.id,slotIndex])).rows[0];
    return {
      tournamentId:tournament.id,tournamentStatus:tournament.status,config:tournament.config??{},
      roundNo,slotIndex,slotId:row?.id??null,matchId:row?.match_id??null,
      participantAId:row?.participant_a_id??null,participantAName:row?.participant_a_name??null,
      participantBId:row?.participant_b_id??null,participantBName:row?.participant_b_name??null,
      winnerId:row?.winner_id??null,
    };
  }
  async function resolveRoundSubmissionDeadline(tournamentId,roundNo) {
    roundNo=Number(roundNo);
    if(!Number.isSafeInteger(roundNo)||roundNo<1) throw new StorageError('INVALID_INPUT','roundNo phải là số nguyên > 0');
    return transaction(async client=>{
      const tournament=(await query('SELECT id,status,format,config FROM tournaments WHERE id=$1 OR code=$1 FOR UPDATE',[tournamentId],client)).rows[0];
      if(!tournament) throw new StorageError('TOURNAMENT_NOT_FOUND','Tournament not found',404);
      if(tournament.format!=='single_elimination') throw new StorageError('FORMAT_NOT_SUPPORTED','Chỉ hỗ trợ xử lý hết giờ cho thể thức loại trực tiếp.');
      const config=tournament.config??{};
      const entries=await listTournamentEntries(tournament.id,client);
      const rounds=await listTournamentRounds(tournament.id,client);
      const round=rounds.find(item=>Number(item.round_no)===roundNo);
      if(!round) throw new StorageError('ROUND_NOT_FOUND','Không tìm thấy vòng đấu này.',404);
      const bracket=buildBracket({rounds,entryCount:entries.length});
      const totalRounds=bracket.totalRounds;
      const roundIds=rounds.map(item=>item.id);
      const results=[];
      for(const slot of round.matches){
        if(slot.winner_id||slot.match_id||!slot.participant_a_id||!slot.participant_b_id) continue;
        if(slot.participant_a_id===BYE_ID||slot.participant_b_id===BYE_ID) continue;
        const aSub=await submissionOf(tournament.id,config,slot.participant_a_id,roundNo);
        const bSub=await submissionOf(tournament.id,config,slot.participant_b_id,roundNo);
        let winnerId=null;let reason=null;
        if(aSub&&!bSub){winnerId=slot.participant_a_id;reason='FORFEIT';}
        else if(!aSub&&bSub){winnerId=slot.participant_b_id;reason='FORFEIT';}
        else if(!aSub&&!bSub){winnerId=Math.random()<0.5?slot.participant_a_id:slot.participant_b_id;reason='RANDOM';}
        else continue;
        const winnerName=winnerId===slot.participant_a_id?slot.participant_a_name:slot.participant_b_name;
        const winner={id:winnerId,name:winnerName};
        const result={reason,source_match_id:null,forfeit:true};
        await query(`UPDATE tournament_match_history SET winner_id=$1,result=$2::jsonb,played_at=now() WHERE round_id=$3 AND slot_index=$4`,
          [winnerId,JSON.stringify(result),round.id,slot.slot_index],client);
        await promoteWinner({tournamentId:tournament.id,roundIds,totalRounds,roundNo,slotIndex:slot.slot_index,winner},client);
        await refreshRoundStatuses({tournamentId:tournament.id,totalRounds,entryCount:entries.length},client);
        results.push({roundNo,slotIndex:slot.slot_index,winnerId,reason});
      }
      const winnerRows=(await query('SELECT DISTINCT winner_id FROM tournament_match_history WHERE round_id=$1 AND winner_id IS NOT NULL',[round.id],client)).rows;
      const allSettled=winnerRows.length===bracket.rounds[roundNo-1].length;
      await query('UPDATE tournament_rounds SET status=$1 WHERE id=$2',[allSettled?'completed':'in_progress',round.id],client);
      if(allSettled&&roundNo<totalRounds){
        const next=rounds.find(item=>Number(item.round_no)===roundNo+1);
        // Vòng kế chỉ tự mở khi chủ giải đã đặt giờ và giờ đó tới hạn; chưa đặt thì chờ bấm mở.
        const due=next&&Number(next.auto_start)===1
          &&(!next.scheduled_at||Date.parse(next.scheduled_at)<=Date.now());
        if(next&&due){
          const windowMinutes=Number(config.submissionWindowMinutes)||10;
          const startedAt=new Date().toISOString();
          const deadline=new Date(Date.now()+windowMinutes*60*1000).toISOString();
          await query('UPDATE tournament_rounds SET status=$1,submission_started_at=$2,submission_deadline=$3 WHERE id=$4',
            ['in_progress',iso(startedAt),iso(deadline),next.id],client);
        }
      }
      if(roundNo===totalRounds&&results.some(r=>r.winnerId)){
        await query("UPDATE tournaments SET status='completed',champion_id=$1 WHERE id=$2",[results[0].winnerId,tournament.id],client);
      }
      return {tournamentId:tournament.id,roundNo,results,resolved:results.length};
    });
  }
  return { initialize, registerTeam, addTeamMember, getTeamMembers, getTeam,
    startMatch, appendTurn, finishMatch, getMatch, listMatches, getReplay, getRankings,
    listGames, upsertUser, getAuthUser, findAuthUser, createAuthUser, updateAuthPassword, getAuthIdentity, addAuthIdentity,
    listAuthIdentities, saveAuthSession, getAuthSession, deleteAuthSession, listTournaments, getTournament, createTournament, createTournamentRound, addTournamentEntry, setEntrySubmission,
    recordTournamentMatch, updateTournamentStatus, saveBotSubmission, listBotSubmissions, getBotSubmission, getBotSubmissionById, importReplay,
    generateTournamentBracket, attachSlotResult, getUserPublicProfile, searchUsers,
    listTournamentNotifications, markTournamentNotificationRead,
    getTournamentMyMatch, setTournamentReady, submitTournamentRoundBot,
    getTournamentSlot, resolveRoundSubmissionDeadline,
    updateTournamentSchedule, updateTournamentRegistrationWindow, updateRoundSchedule, triggerRoundStart, rescheduleMatch, listAutoStartDue, listRoundsDueToStart,
    abortInterruptedMatches, close:()=>pool.end() };

  async function updateTournamentSchedule(tournamentId, scheduledAt) {
    await query('UPDATE tournaments SET starts_at = $1 WHERE id = $2', [scheduledAt ? iso(scheduledAt) : null, tournamentId]);
    return getTournament(tournamentId);
  }

  // Chủ giải sửa khung mở/đóng đơn; chỉ khi giải còn đang mở đơn.
  async function updateTournamentRegistrationWindow(tournamentId, { registrationOpensAt, registrationClosesAt, startsAt } = {}) {
    const row = (await query('SELECT status, config, starts_at FROM tournaments WHERE id=$1', [tournamentId])).rows[0];
    if (!row) throw new StorageError('TOURNAMENT_NOT_FOUND', 'Tournament not found', 404);
    if (row.status !== 'open') {
      throw new StorageError('TOURNAMENT_STARTED', 'Giải đã khởi tranh, không sửa được khung đăng ký', 409);
    }
    const opensAt = iso(required(registrationOpensAt, 'registrationOpensAt'));
    const closesAt = iso(required(registrationClosesAt, 'registrationClosesAt'));
    if (Date.parse(closesAt) <= Date.parse(opensAt)) {
      throw new StorageError('INVALID_INPUT', 'registrationClosesAt phải sau registrationOpensAt');
    }
    const config = { ...(row.config ?? {}), registrationOpensAt: opensAt, registrationClosesAt: closesAt };
    const beginsAt = startsAt === undefined || startsAt === null
      ? (row.starts_at ? iso(row.starts_at) : null) : iso(startsAt);
    // Mốc khởi tranh (giữ nguyên hoặc mới) luôn phải sau đóng đơn.
    if (beginsAt && Date.parse(beginsAt) <= Date.parse(closesAt)) {
      throw new StorageError('KICKOFF_BEFORE_CLOSE', 'Ngày khởi tranh phải sau thời gian đóng đơn', 400);
    }
    await query('UPDATE tournaments SET config=$1::jsonb, starts_at=$2 WHERE id=$3', [JSON.stringify(config), beginsAt, tournamentId]);
    return getTournament(tournamentId);
  }

  // Giải có lịch khởi tranh tới hạn, đã đóng đơn, còn open, chưa có sơ đồ.
  async function listAutoStartDue(now = Date.now()) {
    const { rows } = await query(
      "SELECT id, starts_at, config FROM tournaments WHERE status = 'open' AND format = 'single_elimination' AND starts_at IS NOT NULL"
    );
    const due = [];
    for (const row of rows) {
      if (new Date(row.starts_at).getTime() > now) continue;
      const config = row.config ?? {};
      if (config.registrationClosesAt && now < new Date(config.registrationClosesAt).getTime()) continue;
      const hasBracket = (await query('SELECT id FROM tournament_rounds WHERE tournament_id = $1 LIMIT 1', [row.id])).rows[0];
      if (hasBracket) continue;
      due.push(row.id);
    }
    return due;
  }

  // Các vòng pending đã chủ giải đặt giờ tới hạn, vòng trước đã xong.
  async function listRoundsDueToStart(now = Date.now()) {
    const { rows } = await query(`SELECT r.id, r.tournament_id, r.round_no, r.scheduled_at, r.auto_start
      FROM tournament_rounds r
      WHERE r.status = 'pending' AND r.auto_start = TRUE AND r.scheduled_at IS NOT NULL AND r.submission_started_at IS NULL`);
    const due = [];
    for (const row of rows) {
      if (Date.parse(row.scheduled_at) > now) continue;
      const prev = (await query('SELECT status FROM tournament_rounds WHERE tournament_id = $1 AND round_no = $2', [row.tournament_id, row.round_no - 1])).rows[0];
      if (!prev || prev.status !== 'completed') continue;
      due.push({ id: row.id, tournament_id: row.tournament_id, round_no: row.round_no });
    }
    return due;
  }

  async function updateRoundSchedule(tournamentId, roundId, scheduledAt, autoStart) {
    await query('UPDATE tournament_rounds SET scheduled_at = $1, auto_start = $2 WHERE id = $3 AND tournament_id = $4',
      [scheduledAt ? iso(scheduledAt) : null, autoStart, roundId, tournamentId]);
    return (await query('SELECT id, tournament_id, round_no, status, scheduled_at, auto_start FROM tournament_rounds WHERE id = $1', [roundId])).rows[0];
  }

  async function triggerRoundStart(tournamentId, roundId) {
    // Mở vòng ngay: bật trạng thái, ghi giờ bắt đầu và cửa sổ nộp code mới.
    return transaction(async client => {
      const row=(await query('SELECT id,tournament_id,round_no,status FROM tournament_rounds WHERE id=$1 AND tournament_id=$2',[roundId,tournamentId],client)).rows[0];
      if(!row) throw new StorageError('ROUND_NOT_FOUND','Tournament round not found',404);
      if(row.status==='completed') throw new StorageError('ROUND_COMPLETED','Vòng đấu đã kết thúc.',409);
      if(row.round_no>1){
        const prev=(await query('SELECT status FROM tournament_rounds WHERE tournament_id=$1 AND round_no=$2',[tournamentId,row.round_no-1],client)).rows[0];
        if(!prev||prev.status!=='completed') throw new StorageError('PREV_ROUND_UNFINISHED','Vòng trước chưa kết thúc nên chưa thể mở vòng này.',409);
      }
      const config=(await query('SELECT config FROM tournaments WHERE id=$1',[tournamentId],client)).rows[0].config??{};
      const windowMinutes=Number(config.submissionWindowMinutes)||10;
      const nowIso=new Date().toISOString();
      const deadlineIso=new Date(Date.now()+windowMinutes*60*1000).toISOString();
      await query(`UPDATE tournament_rounds SET status='in_progress',scheduled_at=$1,auto_start=TRUE,
        submission_started_at=$2,submission_deadline=$3 WHERE id=$4 AND tournament_id=$5`,
        [iso(nowIso),iso(nowIso),iso(deadlineIso),roundId,tournamentId],client);
      return (await query('SELECT id,tournament_id,round_no,status,scheduled_at,auto_start,submission_started_at,submission_deadline FROM tournament_rounds WHERE id=$1',[roundId],client)).rows[0];
    });
  }

  async function rescheduleMatch(matchId, scheduledAt) {
    await query('UPDATE matches SET scheduled_at = $1 WHERE id = $2', [scheduledAt ? iso(scheduledAt) : null, matchId]);
    return getMatch(matchId);
  }
}
