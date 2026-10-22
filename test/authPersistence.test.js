import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMatchStore } from "../net/storage/matchStore.js";
import { createAuthService } from "../net/auth/authService.js";
import { createHttpServer } from "../net/http.js";

async function start(t, filename, overrides = {}) {
  const storage = createMatchStore({ filename });
  const authService = createAuthService({ storage, googleClientId:"test-client", ...overrides });
  const server = createHttpServer({ matchStore:storage, authService });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));storage.close();};
  t.after(close);
  return { storage, authService, base:`http://127.0.0.1:${server.address().port}`, close };
}

test("auth: password account, identity links and session survive backend restart", async t => {
  const dir=await mkdtemp(join(tmpdir(),"ltm-auth-")), filename=join(dir,"auth.sqlite");
  const first=await start(t,filename,{
    verifyGoogle:async token=>token==="valid-google"?{sub:"google-person-1",email:"player@example.com",email_verified:true,name:"Player"}:null,
  });
  const post=(path,body,token)=>fetch(`${first.base}${path}`,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const registered=await post("/api/auth/register",{display_name:"Player One",identifier:"player@example.com",password:"strong-pass-123"});
  assert.equal(registered.status,200,await registered.clone().text());
  const account=await registered.json();
  const linked=await post("/api/auth/link/google",{id_token:"valid-google"},account.token);
  assert.equal(linked.status,200,await linked.clone().text());
  assert.deepEqual((await linked.json()).user.linked_accounts.map(x=>x.provider),["email","google"]);
  await first.close();
  const second=await start(t,filename);
  const profile=await fetch(`${second.base}/api/me`,{headers:{Authorization:`Bearer ${account.token}`}});
  assert.equal(profile.status,200);
  assert.equal((await profile.json()).user.id,account.user.id);
  const login=await fetch(`${second.base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"PLAYER@example.com",password:"strong-pass-123"})});
  assert.equal(login.status,200);
  assert.equal((await login.json()).user.id,account.user.id);
  t.after(()=>rm(dir,{recursive:true,force:true}));
});

test("auth: Google account without password can set one, then log in with email", async t => {
  const dir=await mkdtemp(join(tmpdir(),"ltm-auth-setpw-")), filename=join(dir,"auth-setpw.sqlite");
  const inst=await start(t,filename,{
    verifyGoogle:async token=>token==="valid-google-setpw"?{sub:"google-person-setpw",email:"gplayer@example.com",email_verified:true,name:"G Player"}:null,
  });
  const post=(path,body,token)=>fetch(`${inst.base}${path}`,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});

  const google=await post("/api/auth/google",{id_token:"valid-google-setpw"});
  assert.equal(google.status,200,await google.clone().text());
  const account=await google.json();
  assert.equal(account.user.has_password,false);

  const tooShort=await post("/api/auth/set-password",{password:"short"},account.token);
  assert.equal(tooShort.status,400);

  const saved=await post("/api/auth/set-password",{password:"strong-pass-456"},account.token);
  assert.equal(saved.status,200,await saved.clone().text());
  assert.equal((await saved.json()).user.has_password,true);

  const again=await post("/api/auth/set-password",{password:"another-pass-789"},account.token);
  assert.equal(again.status,409);

  const login=await post("/api/auth/login",{identifier:"gplayer@example.com",password:"strong-pass-456"});
  assert.equal(login.status,200,await login.clone().text());
  assert.equal((await login.json()).user.id,account.user.id);

  t.after(()=>rm(dir,{recursive:true,force:true}));
});

test("auth: Facebook login verifies access_token, links identity and survives restart", async t => {
  const dir = await mkdtemp(join(tmpdir(), "ltm-auth-fb-")), filename = join(dir, "auth-fb.sqlite");
  const serverInst = await start(t, filename, {
    facebookAppId: "test-fb-app-id",
    facebookAppSecret: "test-fb-secret",
    verifyFacebook: async token => token === "valid-fb-token" ? {
      sub: "fb-user-12345",
      name: "FB Player",
      email: "fbplayer@example.com",
      email_verified: true,
      picture: "https://example.com/fb.jpg",
    } : null,
  });

  const post = (path, body, token) => fetch(`${serverInst.base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  // 1. Login with Facebook directly
  const fbLogin = await post("/api/auth/facebook", { access_token: "valid-fb-token" });
  assert.equal(fbLogin.status, 200, await fbLogin.clone().text());
  const fbData = await fbLogin.json();
  assert.equal(fbData.user.display_name, "FB Player");
  assert.equal(fbData.user.avatar_url, "https://example.com/fb.jpg");
  assert.ok(fbData.token);

  // 2. Reject invalid token
  const badLogin = await post("/api/auth/facebook", { access_token: "invalid-token" });
  assert.equal(badLogin.status, 401);

  // 3. Reject when Facebook is not configured
  const unconfiguredServer = await start(t, join(dir, "auth-unconfigured.sqlite"), {
    facebookAppId: "",
    facebookAppSecret: "",
  });
  const unconfRes = await fetch(`${unconfiguredServer.base}/api/auth/facebook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: "valid-fb-token" }),
  });
  assert.equal(unconfRes.status, 503);
  assert.equal((await unconfRes.json()).error, "FACEBOOK_NOT_CONFIGURED");

  t.after(() => rm(dir, { recursive: true, force: true }));
});
