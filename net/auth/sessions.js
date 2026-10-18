import { randomBytes } from "node:crypto";

// Token phiên: chuỗi ngẫu nhiên 256 bit, hết hạn sau ttlMs.
export function createSessionStore({ ttlMs = 24 * 60 * 60 * 1000, now = Date.now } = {}) {
    const sessions = new Map();
    return {
        issue(userId) {
            const token = randomBytes(32).toString("base64url");
            sessions.set(token, { userId, expiresAt: now() + ttlMs });
            return token;
        },
        // Trả về userId hoặc null nếu token sai/hết hạn.
        resolve(token) {
            if (typeof token !== "string") return null;
            const session = sessions.get(token);
            if (!session) return null;
            if (session.expiresAt <= now()) {
                sessions.delete(token);
                return null;
            }
            return session.userId;
        },
        revoke(token) {
            sessions.delete(token);
        },
    };
}
