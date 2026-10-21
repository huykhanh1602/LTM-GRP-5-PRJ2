import { findSlotByMatchId } from '../../../domain/tournament/Bracket.js';

// Repository in-memory dùng cho unit test.
// Production adapter cần row lock và lưu bracket_json + tournament_matches.
export function createInMemoryTournamentRepository({ initial = [] } = {}) {
  const store = new Map(initial.map((item) => [item.id, structuredClone(item)]));

  const tx = {
    async getForUpdate(id) {
      const tournament = store.get(id);
      if (!tournament) throw new Error(`Tournament không tồn tại: ${id}`);
      return structuredClone(tournament);
    },

    async save(tournament) {
      store.set(tournament.id, structuredClone(tournament));
      return structuredClone(tournament);
    },
  };

  return {
    async transaction(work) {
      const snapshot = new Map(
        [...store.entries()].map(([id, item]) => [id, structuredClone(item)]),
      );
      try {
        return await work(tx);
      } catch (error) {
        store.clear();
        for (const [id, item] of snapshot) store.set(id, item);
        throw error;
      }
    },

    async create(tournament) {
      if (store.has(tournament.id)) {
        throw new Error(`Tournament đã tồn tại: ${tournament.id}`);
      }
      store.set(tournament.id, structuredClone(tournament));
      return structuredClone(tournament);
    },

    async get(id) {
      const tournament = store.get(id);
      if (!tournament) throw new Error(`Tournament không tồn tại: ${id}`);
      return structuredClone(tournament);
    },

    async getForUpdate(id) {
      return tx.getForUpdate(id);
    },

    async save(tournament) {
      return tx.save(tournament);
    },

    async list({ status, limit = 20, offset = 0 } = {}) {
      const all = [...store.values()]
        .filter((item) => !status || item.status === status)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

      return {
        items: all.slice(offset, offset + limit).map((item) => structuredClone(item)),
        total: all.length,
        limit,
        offset,
      };
    },

    async findByMatchId(matchId) {
      for (const tournament of store.values()) {
        if (!tournament.bracket) continue;
        const slot = findSlotByMatchId(tournament.bracket, matchId);
        if (slot) {
          return {
            tournamentId: tournament.id,
            matchKey: slot.matchKey,
            slot: structuredClone(slot),
          };
        }
      }
      return null;
    },
  };
}
