import { createHash, randomBytes } from "node:crypto";

const digest = token => createHash("sha256").update(token).digest("hex");

export function createSessionStore({ ttlMs = 24 * 60 * 60 * 1000, now = Date.now, storage = null } = {}) {
    const sessions = new Map();
    return {
        async issue(userId) {
            const token = randomBytes(32).toString("base64url");
            const session = { tokenHash: digest(token), userId, expiresAt: now() + ttlMs };
            if (storage) await storage.saveAuthSession(session);
            else sessions.set(token, session);
            return token;
        },
        async resolve(token) {
            if (typeof token !== "string") return null;
            const session = storage ? await storage.getAuthSession(digest(token)) : sessions.get(token);
            if (!session) return null;
            if (session.expiresAt <= now()) {
                if (storage) await storage.deleteAuthSession(digest(token)); else sessions.delete(token);
                return null;
            }
            return session.userId;
        },
        async revoke(token) {
            if (storage && typeof token === "string") await storage.deleteAuthSession(digest(token));
            else sessions.delete(token);
        },
    };
}
