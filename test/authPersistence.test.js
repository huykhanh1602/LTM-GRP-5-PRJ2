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
