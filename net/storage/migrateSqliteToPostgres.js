import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';

export async function migrateSqliteToPostgres({ filename = process.env.DB_PATH || resolve('data/game.sqlite'),
  connectionString = process.env.DATABASE_URL, poolOptions = {} } = {}) {
  if (!connectionString) throw new Error('Set DATABASE_URL to the target PostgreSQL database.');
  if (!existsSync(filename)) mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const pool = new Pool({ connectionString, max: 1, ...poolOptions });
  const mapping = [
    ['games', 'INSERT INTO games(id,name,default_config,active) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(id) DO NOTHING',
      r => [r.id,r.name,r.default_config_json,r.active === 1]],
    ['teams', 'INSERT INTO teams(id,name,created_at) VALUES($1,$2,$3::timestamptz) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name',
      r => [r.id,r.name,r.created_at]],
    ['users', 'INSERT INTO users(id,display_name,avatar_url,student_id,role,banned,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz) ON CONFLICT(id) DO NOTHING',
      r => [r.id,r.display_name,r.avatar_url,r.student_id,r.role,r.banned === 1,r.created_at]],
    ['auth_identities', 'INSERT INTO auth_identities(user_id,provider,provider_user_id,email) VALUES($1,$2,$3,$4) ON CONFLICT(provider,provider_user_id) DO NOTHING',
      r => [r.user_id,r.provider,r.provider_user_id,r.email]],
    ['matches', `INSERT INTO matches(id,room_id,game_id,mode,round_id,team_a_id,team_b_id,status,ranked,winner_id,reason,started_at,ended_at,config,initial_state,final_state,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb) ON CONFLICT(id) DO NOTHING`,
      r => [r.id,r.room_id,r.game_id ?? 'rps_chess',r.mode ?? (r.ranked ? 'ranked' : 'casual'),r.round_id ?? null,r.team_a_id,r.team_b_id,r.status,r.ranked === 1,r.winner_id,r.reason,r.started_at,r.ended_at,r.config_json,r.initial_state_json,r.final_state_json,r.result_json]],
    ['match_turns', `INSERT INTO match_turns(match_id,turn,player,actions,events,state,created_at)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::timestamptz) ON CONFLICT(match_id,turn) DO NOTHING`,
      r => [r.match_id,r.turn,r.player,r.actions_json,r.events_json,r.state_json,r.created_at]],
    ['tournaments', `INSERT INTO tournaments(id,game_id,code,name,format,status,config,starts_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9::timestamptz) ON CONFLICT(id) DO NOTHING`,
      r => [r.id,r.game_id,r.code,r.name,r.format,r.status,r.config_json,r.starts_at,r.created_at]],
    ['tournament_rounds', 'INSERT INTO tournament_rounds(id,tournament_id,round_no,status) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
      r => [r.id,r.tournament_id,r.round_no,r.status]],
    ['tournament_entries', 'INSERT INTO tournament_entries(tournament_id,user_id,seed,points) VALUES($1,$2,$3,$4) ON CONFLICT(tournament_id,user_id) DO NOTHING',
      r => [r.tournament_id,r.user_id,r.seed,r.points]],
    ['bot_submissions', `INSERT INTO bot_submissions(id,room_id,team_id,filename,source,source_sha256,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz) ON CONFLICT(id) DO NOTHING`,
      r => [r.id,r.room_id,r.team_id,r.filename,r.source,r.source_sha256,r.created_at]],
  ];
  const counts = {};
  const client = await pool.connect();
  try {
    await client.query(readFileSync(new URL('./postgres-schema.sql', import.meta.url), 'utf8'));
    await client.query('BEGIN');
    for (const [table, sql, values] of mapping) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) await client.query(sql, values(row));
      counts[table] = rows.length;
    }
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release(); sqlite.close(); await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const counts = await migrateSqliteToPostgres();
    console.log('SQLite data copied to PostgreSQL (source left unchanged):');
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}
