// Xác minh Google ID token bằng endpoint tokeninfo của Google (không cần thêm thư viện).
// Cần biến môi trường GOOGLE_CLIENT_ID (Client ID của ứng dụng web trên Google Cloud).
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export async function verifyGoogleIdToken(idToken, { clientId, fetchImpl = fetch, now = Date.now } = {}) {
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID chưa được cấu hình.");
    if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) return null;

    const response = await fetchImpl(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!response.ok) return null;
    const claims = await response.json();

    if (claims.aud !== clientId) return null;
    if (!ISSUERS.has(claims.iss)) return null;
    if (!(Number(claims.exp) * 1000 > now())) return null;
    if (claims.email_verified !== undefined && String(claims.email_verified) !== "true") return null;
    if (!claims.sub) return null;

    return {
        sub: String(claims.sub),
        email: claims.email ?? null,
        name: claims.name ?? null,
        picture: claims.picture ?? null,
    };
}
