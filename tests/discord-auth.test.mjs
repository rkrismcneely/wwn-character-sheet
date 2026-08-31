import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createAuth } from "../lib/auth.ts";
import { configuredProviders, authErrorMessage } from "../lib/auth-providers.ts";
import { availableAuthProviders, connectedAccounts } from "../lib/account/connected-accounts.ts";
import { safeAuthResponse } from "../lib/auth-response.ts";

// Execute the actual Better Auth D1 adapter against an in-memory SQLite database.
class D1 {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      first: async () => statement.get(...values) ?? null,
      all: async () => ({ results: statement.all(...values), success: true, meta: { changes: this.sqlite.prepare("SELECT changes() AS n").get().n } }),
      run: async () => ({ success: true, meta: { changes: Number(statement.run(...values).changes) } }),
    };
  }
  async exec(sql) { this.sqlite.exec(sql); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.all())); }
}

const origin = "http://localhost:5173";
const secret = "discord-auth-local-test-secret-not-for-production-123456";
function fixture({ discord = true, migration = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql")).sort();
  for (const file of migrations) if (migration || !file.startsWith("0013")) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const db = new D1(sqlite);
  const env = { DB: db, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: "test-google-client", GOOGLE_CLIENT_SECRET: "test-google-secret", ...(discord ? { DISCORD_CLIENT_ID: "test-discord-client", DISCORD_CLIENT_SECRET: "test-discord-secret" } : {}) };
  const auth = createAuth(env);
  function user(id, email, role = "user", provider = "google") {
    const now = Date.now();
    sqlite.prepare("INSERT INTO user (id,name,display_name,email,email_verified,role,created_at,updated_at) VALUES (?, 'Original Name','Custom TWE Name',?,1,?,?,?)").run(id,email,role,now,now);
    sqlite.prepare("INSERT INTO account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(`${id}-account`, `${id}-${provider}`,provider,id,now,now);
    sqlite.prepare("INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(`${id}-session`,`${id}-token`,id,now+86400000,now,now);
  }
  user("owner", "owner@example.test", "admin");
  user("other", "other@example.test");
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO characters (id,owner_user_id,name,class_label,data,created_at,updated_at) VALUES ('character','owner','Preserved','Expert','{}',?,?)").run(now,now);
  sqlite.prepare("INSERT INTO campaigns (id,public_id,owner_user_id,name,created_at,updated_at) VALUES ('campaign',?,'owner','Preserved',?,?)").run(`cmp_${"T".repeat(22)}`,now,now);
  sqlite.prepare("INSERT INTO campaign_members (campaign_id,user_id,role,joined_at) VALUES ('campaign','other','player',?)").run(now);
  sqlite.prepare("INSERT INTO campaign_characters (campaign_id,character_id,added_at) VALUES ('campaign','character',?)").run(now);
  function cookie(id) {
    const value = `${id}-token`;
    return `better-auth.session_token=${encodeURIComponent(`${value}.${createHmac("sha256", secret).update(value).digest("base64")}`)}`;
  }
  function request(path, { body, cookies = "", method = body ? "POST" : "GET", requestOrigin = origin } = {}) {
    return auth.handler(new Request(`${origin}/api/auth${path}`, { method, headers: { origin: requestOrigin, cookie: cookies, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  }
  function snapshot() {
    return JSON.stringify(["user","characters","campaigns","campaign_members","campaign_characters"].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()));
  }
  return { sqlite, db, env, auth, request, cookie, snapshot };
}

function responseCookies(response) { return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; "); }
async function start(f, provider = "discord", user = "owner", extra = {}) {
  const response = await f.request(user ? "/link-social" : "/sign-in/social", { cookies: user ? f.cookie(user) : "", body: { provider, callbackURL: "/", ...extra } });
  assert.equal(response.status, 200, await response.clone().text());
  const url = new URL((await response.json()).url);
  return { state: url.searchParams.get("state"), cookies: `${user ? f.cookie(user) + "; " : ""}${responseCookies(response)}`, url };
}

async function callback(f, flow, profile, { provider = "discord", ...options } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = decodeURI(String(input instanceof Request ? input.url : input)).replace("%40", "@");
    if (url === "https://discord.com/api/oauth2/token") return Response.json({ access_token: "test-access", refresh_token: "test-refresh", token_type: "Bearer", expires_in: 3600, scope: "identify email" });
    if (url === "https://discord.com/api/users/@me") return Response.json({ username: "Discord Name", global_name: "Changed Provider Name", avatar: null, discriminator: "0", ...profile });
    if (url === "https://oauth2.googleapis.com/token") {
      assert.ok(new URLSearchParams(init.body).get("code_verifier"), "Google PKCE retained");
      const idToken = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(profile)).toString("base64url")}.test`;
      return Response.json({ access_token: "google-test-access", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: "openid email profile" });
    }
    throw new Error(`Unexpected test network request: ${new URL(url).origin}`);
  };
  try { return await f.request(`/callback/${provider}?state=${flow.state}&code=test-code`, { cookies: flow.cookies, ...options }); }
  finally { globalThis.fetch = originalFetch; }
}

test("Discord configuration is optional; Google scopes and PKCE remain unchanged", async () => {
  const f = fixture({ discord: false });
  assert.deepEqual(configuredProviders(f.env), ["google"]);
  const flow = await start(f, "google", null);
  assert.deepEqual(flow.url.searchParams.get("scope").split(" ").sort(), ["email","openid","profile"]);
  assert.ok(flow.url.searchParams.get("code_challenge"));
  assert.equal((await f.request("/sign-in/social", { body: { provider: "discord", callbackURL: "/" } })).status, 400);
  f.sqlite.close();
});

test("explicit linking preserves canonical user, admin, profile, ownership and membership; both sign-ins resolve to it", async () => {
  const f = fixture();
  const before = f.snapshot();
  const flow = await start(f);
  assert.equal(flow.url.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/discord`);
  assert.deepEqual(flow.url.searchParams.get("scope").split(" ").sort(), ["email","identify"]);
  const linked = await callback(f, flow, { id: "123456789", email: "different@example.test", verified: true });
  assert.equal(linked.status, 302);
  assert.match(linked.headers.get("location"), /\/account\?connected=1$/u);
  assert.equal(f.snapshot(), before);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE user_id='owner'").get().n, 2);
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE provider_id='discord'").get().user_id, "owner");
  assert.ok(!linked.headers.getSetCookie().some(value => value.startsWith("better-auth.session_token=")), "link does not switch session");
  for (const provider of ["google", "discord"]) {
    const login = await start(f, provider, null);
    const response = await callback(f, login, provider === "google"
      ? { sub: "owner-google", email: "owner@example.test", email_verified: true, name: "New Google Name" }
      : { id: "123456789", email: "different@example.test", verified: true }, { provider });
    assert.equal(response.status, 302);
    const session = await (await f.request("/get-session", { cookies: responseCookies(response) })).json();
    assert.equal(session.user.id, "owner");
    assert.equal(session.user.role, "admin");
    assert.equal(session.user.name, "Original Name");
  }
  assert.equal(f.snapshot(), before);
  f.sqlite.close();
});

test("new verified Discord sign-in creates exactly one canonical user with default user role", async () => {
  const f = fixture();
  const response = await callback(f, await start(f,"discord",null), { id: "234567890", email: "new@example.test", verified: true });
  assert.equal(response.status,302);
  const session = await (await f.request("/get-session", { cookies: responseCookies(response) })).json();
  assert.equal(session.user.email,"new@example.test");
  assert.equal(session.user.role,"user");
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE account_id='234567890'").get().user_id,session.user.id);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user").get().n,3);
  f.sqlite.close();
});

test("a Discord-first user can explicitly connect Google without replacing the canonical identity",async()=>{
  const f=fixture();
  f.sqlite.exec("UPDATE account SET provider_id='discord',account_id='712345678' WHERE user_id='owner'");
  const before=f.snapshot();
  const linked=await callback(f,await start(f,"google"),{sub:"new-google-identity",email:"different@example.test",email_verified:true,name:"New Google Profile"},{provider:"google"});
  assert.match(linked.headers.get("location"),/\/account\?connected=1/u);
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE provider_id='google' AND account_id='new-google-identity'").get().user_id,"owner");
  assert.equal(f.snapshot(),before);
  const login=await callback(f,await start(f,"google",null),{sub:"new-google-identity",email:"different@example.test",email_verified:true,name:"New Google Profile"},{provider:"google"});
  assert.equal((await (await f.request("/get-session",{cookies:responseCookies(login)})).json()).user.id,"owner");
  assert.equal(f.snapshot(),before);
  f.sqlite.close();
});

test("provider owned by someone else cannot be linked or transfer data", async () => {
  const f = fixture();
  assert.equal((await callback(f, await start(f,"discord","other"), { id:"345678901",email:"other@example.test",verified:true })).status,302);
  const before = f.snapshot();
  const response = await callback(f,await start(f),{id:"345678901",email:"owner@example.test",verified:true});
  assert.match(response.headers.get("location"),/account_already_linked_to_different_user/u);
  assert.equal(f.snapshot(),before);
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE account_id='345678901'").get().user_id,"other");
  f.sqlite.close();
});

test("same-email sign-in never implicitly links, for verified or unverified Discord email", async () => {
  for (const verified of [true,false]) {
    const f = fixture();
    const before = f.snapshot();
    const response = await callback(f,await start(f,"discord",null),{id:"456789012",email:"owner@example.test",verified});
    assert.match(response.headers.get("location"),verified ? /account_not_linked/u : /email_not_found/u);
    assert.equal(f.snapshot(),before);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account").get().n,2);
    f.sqlite.close();
  }
});

test("phone-only Discord can explicitly link and later sign in through its exact ID; new email-less user is rejected", async () => {
  const f = fixture();
  const profile = {id:"567890123",email:null,verified:false};
  const before = f.snapshot();
  assert.match((await callback(f,await start(f,"discord",null),profile)).headers.get("location"),/email_not_found/u);
  assert.equal(f.snapshot(),before);
  const linked = await callback(f,await start(f),profile);
  assert.match(linked.headers.get("location"),/\/account\?connected=1$/u);
  assert.equal(f.snapshot(),before);
  const signedIn = await callback(f,await start(f,"discord",null),profile);
  const session = await (await f.request("/get-session",{cookies:responseCookies(signedIn)})).json();
  assert.equal(session.user.id,"owner");
  f.sqlite.close();
});

test("unlink confirms available alternatives, preserves data, and blocks final account including concurrent unlink", async () => {
  const f = fixture();
  const before = f.snapshot();
  assert.equal((await f.request("/unlink-account", {cookies:f.cookie("owner"),body:{providerId:"google"}})).status,400);
  await callback(f,await start(f),{id:"678901234",email:null,verified:false});
  const states = await connectedAccounts(f.db,"owner",f.env);
  assert.ok(states.every(state=>state.connected && state.canDisconnect));
  const outcomes = await Promise.all(["google","discord"].map(providerId=>f.request("/unlink-account",{cookies:f.cookie("owner"),body:{providerId}})));
  assert.equal(outcomes.filter(response=>response.ok).length,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE user_id='owner'").get().n,1);
  assert.equal(f.snapshot(),before);
  const remaining = f.sqlite.prepare("SELECT provider_id AS provider FROM account WHERE user_id='owner'").get().provider;
  const login = await callback(f,await start(f,remaining,null),remaining === "google" ? {sub:"owner-google",email:"owner@example.test",email_verified:true,name:"Original Name"} : {id:"678901234",email:null,verified:false},{provider:remaining});
  assert.equal((await (await f.request("/get-session",{cookies:responseCookies(login)})).json()).user.id,"owner");
  assert.equal((await f.request("/unlink-account",{cookies:f.cookie("owner"),body:{providerId:remaining}})).status,400);
  f.sqlite.close();
});

test("disabled provider is not a usable remaining login method", async () => {
  const f = fixture({discord:false});
  f.sqlite.prepare("INSERT INTO account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES ('d','789012345','discord','owner',1,1)").run();
  assert.equal((await f.request("/unlink-account",{cookies:f.cookie("owner"),body:{providerId:"google"}})).status,400);
  assert.equal((await f.request("/unlink-account",{cookies:f.cookie("owner"),body:{providerId:"discord"}})).status,200);
  f.sqlite.close();
});

test("unauthenticated, changed-session, tampered-state, wrong-provider and foreign-origin linking are rejected", async () => {
  const f = fixture();
  const before=f.snapshot();
  assert.equal((await f.request("/link-social",{body:{provider:"discord",callbackURL:"/account"}})).status,401);
  for (const cookies of ["", f.cookie("other")]) {
    const flow=await start(f);
    const stateCookie=flow.cookies.split("; ").filter(value=>!value.startsWith("better-auth.session_token=")).join("; ");
    const response=await callback(f,flow,{id:"890123456",email:null,verified:false},{cookies:`${cookies}; ${stateCookie}`});
    assert.match(response.headers.get("location"),/link_session_changed/u);
  }
  const badState=await start(f);
  badState.state="tampered";
  assert.match((await callback(f,badState,{id:"890123456",email:null})).headers.get("location"),/state_mismatch/u);
  const wrongProvider=await start(f,"google",null);
  assert.match((await callback(f,wrongProvider,{id:"890123456",email:"new@example.test",verified:true})).headers.get("location"),/state_mismatch/u);
  assert.equal((await f.request("/link-social",{cookies:f.cookie("owner"),requestOrigin:"https://evil.test",body:{provider:"discord",callbackURL:"/account"}})).status,403);
  for (const destination of ["https://evil.test/","//evil.test/","http://127.0.0.1:5173/"]) {
    assert.ok((await f.request("/sign-in/social",{body:{provider:"discord",callbackURL:destination}})).status>=400);
  }
  assert.equal(f.snapshot(),before);
  f.sqlite.close();
});

test("migration preserves Google-only data and atomically enforces both identity and provider uniqueness", async () => {
  const f=fixture({migration:false});
  const before=f.snapshot();
  f.sqlite.exec(readFileSync(new URL("../drizzle/0013_connected_accounts.sql",import.meta.url),"utf8"));
  assert.equal(f.snapshot(),before);
  assert.throws(()=>f.sqlite.exec("INSERT INTO account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES ('duplicate','owner-google','google','other',1,1)"),/UNIQUE/u);
  assert.throws(()=>f.sqlite.exec("INSERT INTO account (id,account_id,provider_id,user_id,created_at,updated_at) VALUES ('duplicate','different-google','google','owner',1,1)"),/UNIQUE/u);
  assert.throws(()=>f.sqlite.exec("DELETE FROM account WHERE user_id='owner'"),/TWE_LAST_LOGIN_METHOD/u);
  const response=await callback(f,await start(f,"google",null),{sub:"owner-google",email:"owner@example.test",email_verified:true,name:"Original Name"},{provider:"google"});
  assert.equal((await (await f.request("/get-session",{cookies:responseCookies(response)})).json()).user.id,"owner");
  await callback(f,await start(f),{id:"812345678",email:null});
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE account_id='812345678'").get().user_id,"owner");
  assert.equal(f.snapshot(),before);
  // The account-only guard must not prevent an intentional parent-user cascade.
  f.sqlite.exec("DELETE FROM user WHERE id='other'");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE user_id='other'").get().n,0);
  f.sqlite.close();
});

test("errors and connected-account projections expose no tokens, provider IDs, or other users",async()=>{
  const f=fixture();
  const rows=await connectedAccounts(f.db,"owner",f.env);
  assert.deepEqual(rows,[{provider:"google",connected:true,available:true,canDisconnect:false},{provider:"discord",connected:false,available:true,canDisconnect:false}]);
  assert.doesNotMatch(JSON.stringify(rows),/owner|other|token|accountId/u);
  assert.equal(authErrorMessage("<script>secret@example.test</script>"),authErrorMessage());
  assert.doesNotMatch(authErrorMessage("account_not_linked"),/Google/u);
  f.sqlite.close();
});

test("new auth features fail closed ahead of migration while existing Google sign-in works",async()=>{
  const f=fixture({migration:false});
  assert.deepEqual(await availableAuthProviders(f.db,f.env),["google"]);
  assert.equal((await f.request("/sign-in/social",{body:{provider:"discord",callbackURL:"/"}})).status,400);
  assert.equal((await f.request("/link-social",{cookies:f.cookie("owner"),body:{provider:"discord",callbackURL:"/account"}})).status,400);
  const response=await callback(f,await start(f,"google",null),{sub:"owner-google",email:"owner@example.test",email_verified:true,name:"Original Name"},{provider:"google"});
  assert.equal((await (await f.request("/get-session",{cookies:responseCookies(response)})).json()).user.id,"owner");
  f.sqlite.close();
});

test("cancellation, missing code, consumed state and client-supplied linking state cannot mutate identity",async()=>{
  const f=fixture();
  const before=f.snapshot();
  const canceled=await start(f);
  const response=await f.request(`/callback/discord?state=${canceled.state}&error=access_denied&error_description=private-provider-data`,{cookies:canceled.cookies});
  assert.match(response.headers.get("location"),/access_denied/u);
  assert.equal(f.snapshot(),before);
  assert.match((await callback(f,canceled,{id:"890123456",email:null})).headers.get("location"),/state_mismatch/u);
  const noCode=await start(f);
  assert.match((await f.request(`/callback/discord?state=${noCode.state}`,{cookies:noCode.cookies})).headers.get("location"),/no_code/u);
  const tampered=await start(f,"discord","owner",{additionalData:{link:{userId:"other",email:"other@example.test"},tweProvider:"google"}});
  await callback(f,tampered,{id:"901234567",email:null});
  assert.equal(f.sqlite.prepare("SELECT user_id FROM account WHERE account_id='901234567'").get().user_id,"owner");
  assert.equal(f.snapshot(),before);
  f.sqlite.close();
});

test("expired sessions cannot link or unlink; another user cannot unlink the owner's provider account",async()=>{
  const f=fixture();
  await callback(f,await start(f),{id:"901234567",email:null});
  const attempt=await f.request("/unlink-account",{cookies:f.cookie("other"),body:{providerId:"discord",accountId:"901234567"}});
  assert.ok(attempt.status>=400);
  f.sqlite.prepare("UPDATE session SET created_at=? WHERE user_id='owner'").run(Date.now()-172800000);
  assert.equal((await f.request("/unlink-account",{cookies:f.cookie("owner"),body:{providerId:"discord"}})).status,403);
  assert.equal((await f.request("/link-social",{cookies:f.cookie("owner"),body:{provider:"discord",callbackURL:"/account"}})).status,401);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE user_id='owner'").get().n,2);
  f.sqlite.close();
});

test("Connected Accounts uses confirmation, accessible controls, server-projected states and fixed callbacks",()=>{
  const source=readFileSync(new URL("../app/account/connected-accounts.tsx",import.meta.url),"utf8");
  for(const expected of ["Connected Accounts","Not connected","Connected","Cancel","setConfirm(account.provider)","authClient.linkSocial","authClient.unlinkAccount","/api/account/connections","canDisconnect","role=\"alert\"","aria-label", "cancelButton.current?.focus()", 'event.key === "Escape"']) assert.ok(source.includes(expected),expected);
  assert.doesNotMatch(source,/userId|accountId|accessToken|refreshToken/u);
  const signIn=readFileSync(new URL("../components/discord-sign-in-button.tsx",import.meta.url),"utf8");
  assert.match(signIn,/if \(!available\) return null/u);
  assert.match(signIn,/Continue with Discord/u);
  assert.match(signIn,/provider-discord-button/u);
  assert.match(signIn,/discord-symbol\.svg/u);
  assert.match(signIn,/callbackURL: "\/"/u);
  const css=readFileSync(new URL("../app/account/account.css",import.meta.url),"utf8");
  assert.match(css,/account-connection[^}]*flex-wrap: wrap/u);
  const landingCss=readFileSync(new URL("../app/landing-density.css",import.meta.url),"utf8");
  assert.match(landingCss,/landing-header nav[^}]*flex-wrap:wrap/u);
});

test("auth route sanitizes provider descriptions, exception details and unknown error codes",async()=>{
  const request=new Request(`${origin}/api/auth/callback/discord`);
  const canceled=await safeAuthResponse(Response.redirect(`${origin}/auth/error?error=access_denied&error_description=private@example.test`,302),request);
  assert.equal(canceled.headers.get("location"),`${origin}/auth/error?error=access_denied`);
  const unknown=await safeAuthResponse(Response.redirect(`${origin}/auth/error?error=secret-provider-id`,302),request);
  assert.equal(unknown.headers.get("location"),`${origin}/auth/error?error=callback_failed`);
  const failed=await safeAuthResponse(Response.json({message:"token=private-token",stack:"database internals"},{status:500}),new Request(`${origin}/api/auth/unlink-account`));
  assert.doesNotMatch(await failed.text(),/private|stack|database/u);
  assert.equal((await safeAuthResponse(new Response("secret",{status:500}),request)).headers.get("location"),`${origin}/auth/error?error=callback_failed`);
});

test("unexpected provider exceptions never reach the router's raw console logger",async()=>{
  const f=fixture();
  const flow=await start(f);
  const messages=[];
  const originalError=console.error;
  console.error=(...args)=>messages.push(args);
  try {
    const response=await callback(f,flow,{id:"malformed-private-provider-id",email:null});
    assert.equal(response.status,500);
    assert.doesNotMatch(await response.text(),/malformed|private|BigInt|stack/u);
    assert.equal(messages.length,0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE user_id='owner'").get().n,1);
  } finally {console.error=originalError;f.sqlite.close();}
});
