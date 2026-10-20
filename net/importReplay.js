import { readFileSync } from 'node:fs';
import { createStorage } from './storage/index.js';
import { parseReplay } from '../src/utils/parseReplay.js';

const [filename, ...flags] = process.argv.slice(2);
if (!filename) {
  console.error('Usage: node net/importReplay.js <replay.json> [--unranked]');
  process.exitCode = 1;
} else {
  let store;
  try {
    if (flags.some(flag => flag !== '--unranked')) throw new Error('Unknown option');
    const replay = parseReplay(readFileSync(filename, 'utf8'));
    store = await createStorage();
    const match = await store.importReplay(replay, { ranked: !flags.includes('--unranked') });
    console.log(`Saved match ${match.id} (${match.status}, ranked=${match.ranked})`);
  } catch (error) {
    console.error(`Import failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await store?.close();
  }
}
