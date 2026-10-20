import { createMatchStore } from './matchStore.js';

export async function createStorage(options = {}) {
  if (options.databaseUrl ?? process.env.DATABASE_URL) {
    const { createPostgresMatchStore } = await import('./postgresStore.js');
    const store = createPostgresMatchStore({
      connectionString: options.databaseUrl ?? process.env.DATABASE_URL,
      poolOptions: options.poolOptions,
    });
    await store.initialize();
    return store;
  }
  return createMatchStore(options);
}
