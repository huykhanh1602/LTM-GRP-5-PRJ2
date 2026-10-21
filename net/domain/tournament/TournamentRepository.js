// Port lưu trữ tournament. Production adapter dùng Postgres row lock.

/**
 * @typedef {Object} TournamentTransaction
 * @property {(id: string) => Promise<object>} getForUpdate
 * @property {(tournament: object) => Promise<object>} save
 */

/**
 * @typedef {Object} TournamentRepository
 * @property {(work: (tx: TournamentTransaction) => Promise<any>) => Promise<any>} transaction
 * @property {(tournament: object) => Promise<object>} create
 * @property {(id: string) => Promise<object>} get
 * @property {(id: string) => Promise<object>} getForUpdate
 * @property {(tournament: object) => Promise<object>} save
 * @property {(query: object) => Promise<object>} list
 * @property {(matchId: string) => Promise<object|null>} findByMatchId
 */

export const TOURNAMENT_REPOSITORY = Symbol('TournamentRepository');
