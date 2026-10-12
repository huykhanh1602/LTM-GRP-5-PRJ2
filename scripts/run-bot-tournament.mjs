import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runEngineMatch } from '../net/engineRunner.js';
import { createMatchStore } from '../net/storage/matchStore.js';

const bots = ['bot1', 'bot2', 'bot3'].map((name, index) => ({
  name, code: readFileSync(new URL(`../engine/bot_sample_${index + 1}.py`, import.meta.url), 'utf8'),
}));
const store = createMatchStore();
const results = [];
const run = randomUUID().slice(0, 8);
try {
  for (const [a, b] of [[0, 1], [1, 0], [0, 2], [2, 0], [1, 2], [2, 1]]) {
    const startedAt = new Date().toISOString();
    console.log(`Playing ${bots[a].name} vs ${bots[b].name}...`);
    const replay = await runEngineMatch({ roomCode: `BOT-TEST-${run}`, teamA: bots[a], teamB: bots[b], onEvent() {} });
    const match = store.importReplay(replay, { roomId: `BOT-TEST-${run}`, ranked: true,
      teamAId: bots[a].name, teamBId: bots[b].name, startedAt, endedAt: new Date().toISOString() });
    const result = { id: match.id, teamA: bots[a].name, teamB: bots[b].name,
      winner: match.winner_id, reason: match.reason, turns: replay.turns.length };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  const rankings = store.getRankings().filter(team => bots.some(bot => bot.name === team.team_id));
  mkdirSync('data/verification', { recursive: true });
  writeFileSync('data/verification/bot-tournament.json', JSON.stringify({ results, rankings }, null, 2));
  console.log('Rankings (all saved ranked matches):');
  console.table(rankings);
} finally { store.close(); }
