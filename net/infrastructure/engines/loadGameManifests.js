import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Dùng cho dev/plugin ngoài. Production nên import games/index.js tường minh
// để tránh dynamic import từ filesystem khi deploy serverless.
export async function loadGameManifests({ gamesRoot }) {
  const entries = await readdir(gamesRoot, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

    const moduleUrl = pathToFileURL(join(gamesRoot, entry.name, 'manifest.js')).href;
    const module = await import(moduleUrl);

    if (!module.manifest) {
      throw new TypeError(`Game ${entry.name} thiếu export manifest.`);
    }
    manifests.push(module.manifest);
  }

  return manifests;
}
