import { verifyGoogleIdToken } from "./google.js";
import { createSessionStore } from "./sessions.js";
import { createUserStore } from "./userStore.js";

const MAX_BODY = 16 * 1024;

// Gom kho người dùng, token phiên và các endpoint HTTP đăng nhập:
//   POST /api/auth/google  { id_token }      -> { token, user }
//   POST /api/auth/guest   { display_name }  -> { token, user }   (khách, chỉ chơi casual)
//   GET  /api/me           Authorization: Bearer <token> -> { user }
export function createAuthService({
    users = createUserStore(),
    sessions = createSessionStore(),
    googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || "",
    verifyGoogle = verifyGoogleIdToken,
    allowGuest = process.env.AUTH_ALLOW_GUEST !== "0",
} = {}) {
    // Trả về người dùng của token, hoặc null.
    function userForToken(token) {
        const userId = sessions.resolve(token);
        return userId ? users.get(userId) : null;
    }

    async function readJson(request) {
        let size = 0;
        const chunks = [];
        for await (const chunk of request) {
            size += chunk.length;
            if (size > MAX_BODY) return { tooLarge: true };
            chunks.push(chunk);
        }
        try {
            const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
            return value && typeof value === "object" && !Array.isArray(value) ? { value } : { invalid: true };
        } catch {
            return { invalid: true };
        }
    }

    async function handle(request, response, url) {
        const sendJson = (status, body) => {
            response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify(body));
        };
        const session = (user) => sendJson(200, {
            token: sessions.issue(user.id),
            user: users.publicUser(user),
        });

        if (url.pathname === "/api/me") {
            if (request.method !== "GET") {
                response.setHeader("Allow", "GET");
                return sendJson(405, { error: "METHOD_NOT_ALLOWED" }), true;
            }
            const user = userForToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
            if (!user) return sendJson(401, { error: "INVALID_TOKEN" }), true;
            return sendJson(200, { user: users.publicUser(user) }), true;
        }

        if (url.pathname !== "/api/auth/google" && url.pathname !== "/api/auth/guest") return false;
        if (request.method !== "POST") {
            response.setHeader("Allow", "POST");
            return sendJson(405, { error: "METHOD_NOT_ALLOWED" }), true;
        }

        const body = await readJson(request);
        if (body.tooLarge) return sendJson(413, { error: "BODY_TOO_LARGE" }), true;
        if (body.invalid) return sendJson(400, { error: "INVALID_MESSAGE", message: "Body phải là JSON object." }), true;

        if (url.pathname === "/api/auth/guest") {
            if (!allowGuest) return sendJson(403, { error: "GUEST_DISABLED", message: "Máy chủ yêu cầu đăng nhập Google." }), true;
            const user = users.createGuest(body.value.display_name);
            if (!user) return sendJson(400, { error: "INVALID_NAME", message: "Tên hiển thị phải có từ 1 đến 30 ký tự." }), true;
            return session(user), true;
        }

        if (!googleClientId) return sendJson(503, { error: "GOOGLE_NOT_CONFIGURED" }), true;
        let claims = null;
        try {
            claims = await verifyGoogle(body.value.id_token, { clientId: googleClientId });
        } catch (error) {
            console.error("Google verification error:", error.message);
            return sendJson(502, { error: "GOOGLE_UNREACHABLE" }), true;
        }
        if (!claims) return sendJson(401, { error: "INVALID_ID_TOKEN" }), true;
        const user = users.findOrCreateExternal({
            provider: "google",
            providerUserId: claims.sub,
            displayName: claims.name,
            email: claims.email,
            avatarUrl: claims.picture,
        });
        return session(user), true;
    }

    return { users, sessions, userForToken, handle, allowGuest };
}
