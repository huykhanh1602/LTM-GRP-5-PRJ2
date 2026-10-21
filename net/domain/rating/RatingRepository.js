// Port lưu trữ rating. Application service chỉ biết interface này.

/**
 * @typedef {Object} RatingRow
 * @property {string} gameId
 * @property {string} userId
 * @property {number} rating
 * @property {number} gamesPlayed
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {string|null} updatedAt
 */

/**
 * @typedef {Object} RatingHistoryEntry
 * @property {string} id
 * @property {string} matchId
 * @property {string} gameId
 * @property {string} userId
 * @property {number} before
 * @property {number} after
 * @property {number} delta
 * @property {'win'|'loss'|'draw'} outcome
 * @property {string|null} reason
 * @property {string} createdAt
 */

/**
 * @typedef {Object} RatingTransaction
 * @property {(input: { matchId: string, gameId: string }) => Promise<boolean>} claimMatch
 * @property {(gameId: string, userId: string) => Promise<RatingRow>} getForUpdate
 * @property {(rows: RatingRow[]) => Promise<void>} save
 * @property {(entry: RatingHistoryEntry) => Promise<void>} appendHistory
 */

/**
 * @typedef {Object} RatingRepository
 * @property {(work: (tx: RatingTransaction) => Promise<any>) => Promise<any>} transaction
 * @property {(gameId: string, userId: string) => Promise<RatingRow>} get
 * @property {(query: object) => Promise<object>} leaderboard
 * @property {(query: object) => Promise<object>} history
 */

export const RATING_REPOSITORY = Symbol('RatingRepository');
