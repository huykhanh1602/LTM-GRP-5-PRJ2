import { randomUUID, scrypt as scryptCallback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { verifyGoogleIdToken } from "./google.js";
import { createSessionStore } from "./sessions.js";
import { createUserStore } from "./userStore.js";

const scrypt = promisify(scryptCallback);
const MAX_BODY = 16 * 1024;
const cleanName = value => typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 30 ? value.trim() : null;
const cleanEmail = value => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const cleanPhone = value => {
    if (typeof value !== "string") return null;
    let phone = value.replace(/[\s().-]/g, "");
    if (/^0\d{9,10}$/.test(phone)) phone = `+84${phone.slice(1)}`;
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
};
const isUniqueViolation = error => error?.code === "23505" || String(error?.code ?? "").startsWith("SQLITE_CONSTRAINT") || /UNIQUE constraint failed/i.test(error?.message ?? "");

export async function verifyFacebookAccessToken(accessToken, { appId, appSecret, fetchImpl = fetch } = {}) {
    if (!appId || !appSecret || typeof accessToken !== "string" || accessToken.length > 4096) return null;
    const debug = new URL("https://graph.facebook.com/debug_token");
    debug.searchParams.set("input_token", accessToken);
    debug.searchParams.set("access_token", `${appId}|${appSecret}`);
    const checked = await fetchImpl(debug);
    if (!checked.ok) return null;
    const info = (await checked.json()).data;
    if (!info?.is_valid || String(info.app_id) !== String(appId) || !info.user_id) return null;
    const profileUrl = new URL("https://graph.facebook.com/me");
    profileUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
    profileUrl.searchParams.set("access_token", accessToken);
    const response = await fetchImpl(profileUrl);
    if (!response.ok) return null;
    const profile = await response.json();
    if (String(profile.id) !== String(info.user_id)) return null;
    return { sub: String(profile.id), name: profile.name ?? null, email: profile.email ?? null, email_verified: !!profile.email,
        picture: profile.picture?.data?.url ?? null };
}

export function createAuthService({
    storage = null,
    users: suppliedUsers = null,
    sessions = createSessionStore({ storage }),
    googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || "",
    facebookAppId = process.env.FACEBOOK_APP_ID?.trim() || "",
    facebookAppSecret = process.env.FACEBOOK_APP_SECRET?.trim() || "",
    verifyGoogle = verifyGoogleIdToken,
    verifyFacebook = verifyFacebookAccessToken,
    allowGuest = process.env.AUTH_ALLOW_GUEST !== "0",
} = {}) {
    const memoryUsers = suppliedUsers ?? createUserStore();
    const users = storage ? { get:id=>storage.getAuthUser(id), publicUser:user=>({id:user.id,display_name:user.display_name,avatar_url:user.avatar_url,guest:false,role:user.role??"player",has_password:!!user.password_salt}) } : memoryUsers;
    const resolveUser = async id => storage ? storage.getAuthUser(id) : users.get(id);
    async function userForToken(token) {
        const userId = await sessions.resolve(token);
        return userId ? resolveUser(userId) : null;
    }
    async function publicProfile(user) {
        const safe = storage ? { id:user.id,display_name:user.display_name,avatar_url:user.avatar_url,guest:false,role:user.role??"player",has_password:!!user.password_salt } : users.publicUser(user);
        if (storage) safe.linked_accounts = await storage.listAuthIdentities(user.id);
        return safe;
    }
    async function readJson(request) {
        let size = 0; const chunks = [];
        for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) return { tooLarge:true }; chunks.push(chunk); }
        try { const value=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"); return value&&typeof value==="object"&&!Array.isArray(value)?{value}:{invalid:true}; }
        catch { return {invalid:true}; }
    }
    async function passwordHash(password, salt) { return scrypt(password, salt, 64); }
    async function makeAccount({ displayName, email = null, phone = null, password, avatarUrl = null }) {
        if (!storage) return memoryUsers.createGuest(displayName);
        const salt = randomBytes(16).toString("hex");
        return storage.createAuthUser({ id:randomUUID(),display_name:displayName,avatar_url:avatarUrl,email,phone,
            password_salt:salt,password_hash:(await passwordHash(password,salt)).toString("hex") });
    }
    async function loginExternal(provider, claims) {
        const existing = await storage.getAuthIdentity(provider, claims.sub);
        if (existing) return storage.getAuthUser(existing.user_id);
        const email = cleanEmail(claims.email);
        // Reuse an existing account only when the provider confirms a verified email.
        let user = email && claims.email_verified ? await storage.findAuthUser(email) : null;
        user ??= await storage.createAuthUser({ display_name:cleanName(claims.name)??email?.split("@")[0]??"Người chơi",avatar_url:claims.picture,email });
        try { await storage.addAuthIdentity({ userId:user.id,provider,providerUserId:claims.sub,email }); }
        catch (error) {
            if (!isUniqueViolation(error)) throw error;
            const linked = await storage.getAuthIdentity(provider,claims.sub);
            if (!linked) throw error;
            user = await storage.getAuthUser(linked.user_id);
        }
        return user;
    }
    async function handle(request, response, url) {
        const sendJson=(status,body)=>{response.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});response.end(JSON.stringify(body));};
        const session=async user=>sendJson(200,{token:await sessions.issue(user.id),user:await publicProfile(user)});
        const token=request.headers.authorization?.replace(/^Bearer\s+/i,"");
        const linkMatch=url.pathname.match(/^\/api\/auth\/link\/(google|facebook)$/);
        if (url.pathname==="/api/me" || url.pathname==="/api/auth/identities" || url.pathname==="/api/auth/logout" || url.pathname==="/api/auth/set-password" || url.pathname==="/api/auth/change-password" || linkMatch) {
            const user=await userForToken(token);
            if (!user) return sendJson(401,{error:"INVALID_TOKEN"}),true;
            if (url.pathname==="/api/me" && request.method==="GET") return sendJson(200,{user:await publicProfile(user)}),true;
            if (url.pathname==="/api/auth/identities" && request.method==="GET") return sendJson(200,{items:await storage.listAuthIdentities(user.id)}),true;
            if (url.pathname==="/api/auth/logout" && request.method==="POST") { await sessions.revoke(token); return sendJson(200,{ok:true}),true; }
            if (url.pathname==="/api/auth/set-password" && request.method==="POST") {
                if (!storage) return sendJson(503,{error:"PERSISTENT_AUTH_REQUIRED"}),true;
                const body=await readJson(request); if (body.tooLarge) return sendJson(413,{error:"BODY_TOO_LARGE"}),true; if (!body.value) return sendJson(400,{error:"INVALID_JSON"}),true;
                const newPassword=body.value.password;
                if (typeof newPassword!=="string"||newPassword.length<8||newPassword.length>128) return sendJson(400,{error:"INVALID_PASSWORD",message:"Mật khẩu phải từ 8 đến 128 ký tự."}),true;
                if (user.password_salt) return sendJson(409,{error:"PASSWORD_ALREADY_SET",message:"Tài khoản đã có mật khẩu."}),true;
                const salt=randomBytes(16).toString("hex");
                const updated=await storage.updateAuthPassword(user.id,salt,(await passwordHash(newPassword,salt)).toString("hex"));
                return sendJson(200,{user:await publicProfile(updated)}),true;
            }
            if (url.pathname==="/api/auth/change-password" && request.method==="POST") {
                if (!storage) return sendJson(503,{error:"PERSISTENT_AUTH_REQUIRED"}),true;
                const body=await readJson(request); if (body.tooLarge) return sendJson(413,{error:"BODY_TOO_LARGE"}),true; if (!body.value) return sendJson(400,{error:"INVALID_JSON"}),true;
                const { old_password:oldPassword, new_password:newPassword } = body.value;
                if (!user.password_salt||!user.password_hash) return sendJson(400,{error:"PASSWORD_NOT_SET",message:"Tài khoản chưa có mật khẩu. Hãy dùng chức năng thêm mật khẩu."}),true;
                if (typeof newPassword!=="string"||newPassword.length<8||newPassword.length>128) return sendJson(400,{error:"INVALID_PASSWORD",message:"Mật khẩu mới phải từ 8 đến 128 ký tự."}),true;
                const actual=await passwordHash(typeof oldPassword==="string"?oldPassword:"",user.password_salt), expected=Buffer.from(user.password_hash,"hex");
                if (actual.length!==expected.length||!timingSafeEqual(actual,expected)) return sendJson(401,{error:"INVALID_CREDENTIALS",message:"Mật khẩu hiện tại không đúng."}),true;
                const salt=randomBytes(16).toString("hex");
                const updated=await storage.updateAuthPassword(user.id,salt,(await passwordHash(newPassword,salt)).toString("hex"));
                return sendJson(200,{user:await publicProfile(updated)}),true;
            }
            if (linkMatch && request.method==="POST") {
                const body=await readJson(request); if (!body.value) return sendJson(400,{error:"INVALID_JSON"}),true;
                const provider=linkMatch[1]; let claims;
                try { claims=provider==="google"?await verifyGoogle(body.value.id_token,{clientId:googleClientId}):await verifyFacebook(body.value.access_token,{appId:facebookAppId,appSecret:facebookAppSecret}); }
                catch { return sendJson(502,{error:"PROVIDER_UNREACHABLE"}),true; }
                if (!claims) return sendJson(401,{error:"INVALID_PROVIDER_TOKEN"}),true;
                try { await storage.addAuthIdentity({userId:user.id,provider,providerUserId:claims.sub,email:cleanEmail(claims.email)}); }
                catch (error) { if (isUniqueViolation(error)) return sendJson(409,{error:"IDENTITY_ALREADY_LINKED"}),true; throw error; }
                return sendJson(200,{user:await publicProfile(await resolveUser(user.id))}),true;
            }
            response.setHeader("Allow",url.pathname==="/api/me"?"GET":"GET, POST"); return sendJson(405,{error:"METHOD_NOT_ALLOWED"}),true;
        }
        const allowed=new Set(["/api/auth/google","/api/auth/facebook","/api/auth/guest","/api/auth/register","/api/auth/login"]);
        if (!allowed.has(url.pathname)) return false;
        if (request.method!=="POST") { response.setHeader("Allow","POST");return sendJson(405,{error:"METHOD_NOT_ALLOWED"}),true; }
        const body=await readJson(request); if (body.tooLarge) return sendJson(413,{error:"BODY_TOO_LARGE"}),true;
        if (!body.value) return sendJson(400,{error:"INVALID_JSON"}),true;
        const data=body.value;
        if (url.pathname==="/api/auth/guest") {
            if (!allowGuest) return sendJson(403,{error:"GUEST_DISABLED"}),true;
            const user=storage?{id:randomUUID(),display_name:cleanName(data.display_name),avatar_url:null,guest:true,role:"player"}:memoryUsers.createGuest(data.display_name);
            if (!user?.display_name) return sendJson(400,{error:"INVALID_NAME"}),true;
            if (storage) { const guest=await storage.createAuthUser({id:user.id,display_name:user.display_name}); user.guest=true; }
            return session(user),true;
        }
        if (url.pathname==="/api/auth/register") {
            const email=cleanEmail(data.identifier), phone=email?null:cleanPhone(data.identifier), displayName=cleanName(data.display_name), password=data.password;
            if ((!email&&!phone)||!displayName||typeof password!=="string"||password.length<8||password.length>128) return sendJson(400,{error:"INVALID_REGISTRATION",message:"Tên, email/số điện thoại hợp lệ và mật khẩu từ 8 ký tự là bắt buộc."}),true;
            if (!storage) return sendJson(503,{error:"PERSISTENT_AUTH_REQUIRED"}),true;
            try { const user=await makeAccount({displayName,email,phone,password}); await storage.addAuthIdentity({userId:user.id,provider:email?"email":"phone",providerUserId:email??phone,email}); return session(user),true; }
            catch(error) { if (isUniqueViolation(error)) return sendJson(409,{error:"ACCOUNT_EXISTS"}),true; throw error; }
        }
        if (url.pathname==="/api/auth/login") {
            const identifier=cleanEmail(data.identifier)??cleanPhone(data.identifier);
            if (!identifier||typeof data.password!=="string"||!storage) return sendJson(401,{error:"INVALID_CREDENTIALS"}),true;
            const user=await storage.findAuthUser(identifier);
            if (!user?.password_salt||!user.password_hash) return sendJson(401,{error:"INVALID_CREDENTIALS"}),true;
            const actual=await passwordHash(data.password,user.password_salt), expected=Buffer.from(user.password_hash,"hex");
            if (actual.length!==expected.length||!timingSafeEqual(actual,expected)) return sendJson(401,{error:"INVALID_CREDENTIALS"}),true;
            return session(user),true;
        }
        const provider=url.pathname.endsWith("/google")?"google":"facebook";
        if (provider==="google"&&!googleClientId) return sendJson(503,{error:"GOOGLE_NOT_CONFIGURED"}),true;
        if (provider==="facebook"&&(!facebookAppId||!facebookAppSecret)) return sendJson(503,{error:"FACEBOOK_NOT_CONFIGURED"}),true;
        let claims;
        try { claims=provider==="google"?await verifyGoogle(data.id_token,{clientId:googleClientId}):await verifyFacebook(data.access_token,{appId:facebookAppId,appSecret:facebookAppSecret}); }
        catch(error) { console.error(`${provider} verification error:`,error.message);return sendJson(502,{error:"PROVIDER_UNREACHABLE"}),true; }
        if (!claims) return sendJson(401,{error:"INVALID_PROVIDER_TOKEN"}),true;
        if (!storage) {
            const user=memoryUsers.findOrCreateExternal({provider,providerUserId:claims.sub,displayName:claims.name,email:claims.email,avatarUrl:claims.picture});
            return session(user),true;
        }
        const user=await loginExternal(provider,claims);
        return session(user),true;
    }
    return { users,sessions,userForToken,authenticateToken:userForToken,handle,allowGuest };
}
