import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  authorizeCharacterWrite,
  canReadCharacter,
  isCharacterOwner,
  isCharacterVisibility,
  isPubliclyDiscoverable,
} from "../lib/characters/authorization.ts";
import {
  generatePublicCharacterId,
  isPlausiblePublicCharacterId,
} from "../lib/characters/identifiers.ts";
import {
  characterForStorage,
} from "../lib/characters/sanitize.ts";
import {
  isPortraitContentType,
  portraitBytesMatchContentType,
  portraitObjectKey,
  validPortraitObjectKey,
} from "../lib/characters/portraits.ts";
import { readBoundedJson, RequestBodyError } from "../lib/http-json.ts";

const owner = { userId: "user-owner", role: "user" };
const otherUser = { userId: "user-other", role: "user" };
const adminOwner = { userId: "user-owner", role: "admin" };
const adminOther = { userId: "user-admin", role: "admin" };
const privateCharacter = { ownerUserId: owner.userId, visibility: "private" };
const unlistedCharacter = { ownerUserId: owner.userId, visibility: "unlisted" };
const publicCharacter = { ownerUserId: owner.userId, visibility: "public" };
const unownedPrivateCharacter = { ownerUserId: null, visibility: "private" };

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("missing session cannot create a character", async () => {
  const route = await source("app/api/characters/route.ts");
  assert.match(route, /export async function POST[\s\S]*getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
});

test("missing session cannot edit or delete a character", async () => {
  const route = await source("app/api/characters/[id]/route.ts");
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const section = route.slice(route.indexOf(`export async function ${method}`));
    assert.match(section, /getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
  }
});

test("owner can read and edit a private character", () => {
  assert.equal(isCharacterOwner(owner, privateCharacter), true);
  assert.equal(canReadCharacter(owner, privateCharacter), true);
  assert.deepEqual(authorizeCharacterWrite(owner, privateCharacter), { allowed: true });
});

test("another signed-in user cannot read a private character", () => {
  assert.equal(canReadCharacter(otherUser, privateCharacter), false);
  assert.deepEqual(authorizeCharacterWrite(otherUser, privateCharacter), { allowed: false, status: 404 });
});

test("another signed-in user cannot edit public or unlisted characters", () => {
  assert.deepEqual(authorizeCharacterWrite(otherUser, publicCharacter), { allowed: false, status: 403 });
  assert.deepEqual(authorizeCharacterWrite(otherUser, unlistedCharacter), { allowed: false, status: 403 });
});

test("administrator read access covers every visibility and unowned legacy rows", () => {
  for (const character of [
    privateCharacter,
    unlistedCharacter,
    publicCharacter,
    unownedPrivateCharacter,
  ]) {
    assert.equal(canReadCharacter(adminOther, character), true);
  }
});

test("administrator write access remains strictly owner-only", () => {
  assert.deepEqual(authorizeCharacterWrite(adminOwner, privateCharacter), { allowed: true });
  assert.deepEqual(authorizeCharacterWrite(adminOther, privateCharacter), { allowed: false, status: 404 });
  assert.deepEqual(authorizeCharacterWrite(adminOther, unlistedCharacter), { allowed: false, status: 403 });
  assert.deepEqual(authorizeCharacterWrite(adminOther, publicCharacter), { allowed: false, status: 403 });
  assert.deepEqual(authorizeCharacterWrite(adminOther, unownedPrivateCharacter), { allowed: false, status: 404 });
});

test("all-character scope is guarded by the server session role", async () => {
  const route = await source("app/api/characters/route.ts");
  assert.match(route, /requestedScope === "all" && !actor[\s\S]*status: 401/u);
  assert.match(route, /requestedScope === "all" && actor\?\.role !== "admin"[\s\S]*status: 403/u);
  assert.match(route, /scope: requestedScope/u);
  assert.doesNotMatch(route, /searchParams\.get\("role"\)|searchParams\.get\("isAdmin"\)/u);
});

test("admin read paths do not weaken mutation endpoints", async () => {
  const [characterRoute, portraitRoute] = await Promise.all([
    source("app/api/characters/[id]/route.ts"),
    source("app/api/characters/[id]/portrait/route.ts"),
  ]);
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const section = characterRoute.slice(characterRoute.indexOf(`export async function ${method}`));
    assert.match(section, /authorizeCharacterWrite\(actor, row\)/u);
  }
  assert.match(characterRoute, /WHERE id = \? AND owner_user_id = \?/u);
  assert.match(portraitRoute, /authorizeCharacterWrite\(actor, row\)/u);
  assert.match(portraitRoute, /owner_user_id = \?/u);
});

test("administrator UI is explicitly read-only for non-owned characters", async () => {
  const page = await source("app/character-sheet.tsx");
  assert.match(page, />All Characters<\/button>/u);
  assert.match(page, /Viewing as administrator · Read only/u);
  assert.match(page, /const canEdit = signedIn && \(!cloudId \|\| cloudCanEdit\)/u);
  assert.match(page, /!hydrated \|\| !canEdit \|\| !cloudId/u);
  assert.match(page, /character\.permissions\.canEdit && <button className="danger-action"/u);
  assert.match(page, /cloudId && canEdit && <section className="character-bottom-utilities"/u);
  assert.match(page, /canEdit && <details className="portrait-action-menu"/u);
});

test("signed-out user can view a public character", () => {
  assert.equal(canReadCharacter(null, publicCharacter), true);
});

test("signed-out user can view an unlisted character at its exact URL", () => {
  assert.equal(canReadCharacter(null, unlistedCharacter), true);
});

test("private character is hidden from public library and search", async () => {
  assert.equal(isPubliclyDiscoverable(privateCharacter), false);
  const database = await source("app/api/characters/db.ts");
  assert.match(database, /visibilityClause = options\.scope === "all"[\s\S]*visibility = 'public' AND public_id IS NOT NULL/u);
});

test("unlisted character is hidden from public library and search", () => {
  assert.equal(isPubliclyDiscoverable(unlistedCharacter), false);
});

test("public character is discoverable", () => {
  assert.equal(isPubliclyDiscoverable(publicCharacter), true);
  assert.equal(isCharacterVisibility("public"), true);
  assert.equal(isCharacterVisibility("friends-only"), false);
});

test("character rename does not change its public ID", () => {
  const record = { publicId: generatePublicCharacterId(), name: "Before" };
  const renamed = { ...record, name: "After" };
  assert.equal(renamed.publicId, record.publicId);
  assert.equal(isPlausiblePublicCharacterId(renamed.publicId), true);
});

test("generated public IDs are opaque, unique, and contain 128 random bits", () => {
  const ids = Array.from({ length: 500 }, () => generatePublicCharacterId());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(isPlausiblePublicCharacterId));
  assert.ok(ids.every(id => id.startsWith("chr_") && id.length === 26));
});

test("client-supplied owner and public IDs are removed before storage", async () => {
  const clean = characterForStorage({
    id: "internal-id",
    owner_user_id: "attacker",
    public_id: "chr_attacker",
    visibility: "public",
    name: "Imported",
  });
  assert.deepEqual(clean, { name: "Imported", portrait: "" });
  const database = await source("app/api/characters/db.ts");
  assert.match(database, /createOwnedCharacter[\s\S]*ownerUserId[\s\S]*generatePublicCharacterId\(\)/u);
  assert.doesNotMatch(database, /body\?\.owner/u);
});

test("portrait update and deletion require ownership", async () => {
  const route = await source("app/api/characters/[id]/portrait/route.ts");
  assert.match(route, /export async function POST[\s\S]*authorizeCharacterWrite\(actor, row\)/u);
  assert.match(route, /export async function DELETE[\s\S]*authorizeCharacterWrite\(actor, row\)/u);
  assert.deepEqual(authorizeCharacterWrite(otherUser, publicCharacter), { allowed: false, status: 403 });
});

test("portrait validation rejects mismatched or unsupported content", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  assert.equal(isPortraitContentType("image/png"), true);
  assert.equal(isPortraitContentType("image/svg+xml"), false);
  assert.equal(portraitBytesMatchContentType(png, "image/png"), true);
  assert.equal(portraitBytesMatchContentType(png, "image/jpeg"), false);
  const key = portraitObjectKey(generatePublicCharacterId(), "image/png");
  assert.equal(validPortraitObjectKey(key), true);
  assert.equal(validPortraitObjectKey("portraits/../another-character.png"), false);
  assert.doesNotMatch(key, /user|email|google/u);
});


test("visible Google sign-in controls keep direct Better Auth click paths", async () => {
  const page = await source("app/character-sheet.tsx");
  assert.match(page, /!signedIn && !libraryOpen && <button[\s\S]*className="primary-action account-signin"[\s\S]*authClient\.signIn\.social\(\{[\s\S]*provider: "google"/u);
  assert.match(page, /className="library-signin"[\s\S]*authClient\.signIn\.social\(\{[\s\S]*provider: "google"/u);
});

test("sign-out removes access to owner-only operations", async () => {
  assert.deepEqual(authorizeCharacterWrite(owner, privateCharacter), { allowed: true });
  assert.deepEqual(authorizeCharacterWrite(null, privateCharacter), { allowed: false, status: 401 });
  const header = await source("app/app-header.tsx");
  assert.match(header, /authClient\.signOut\(\)/u);
  assert.match(header, /window\.location\.assign\("\/"\)/u);
  assert.match(header, /Sign out could not be completed\./u);
});

test("auth build configuration references runtime binding names without secret values", async () => {
  const auth = await source("lib/auth.ts");
  const client = await source("lib/auth-client.ts");
  const example = await source(".dev.vars.example");
  const wrangler = await source("wrangler.jsonc");
  assert.match(auth, /runtimeEnv\.BETTER_AUTH_SECRET/u);
  assert.match(auth, /runtimeEnv\.GOOGLE_CLIENT_ID/u);
  assert.match(auth, /runtimeEnv\.GOOGLE_CLIENT_SECRET/u);
  assert.doesNotMatch(client, /SECRET|CLIENT_ID/u);
  assert.ok(example.startsWith("BETTER_AUTH_SECRET=\nBETTER_AUTH_URL=http://localhost:5173\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nDISCORD_CLIENT_ID=\nDISCORD_CLIENT_SECRET=\n"));
  for (const name of ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "RECAP_STORAGE_ENCRYPTION_KEY"]) {
    assert.match(example, new RegExp("^" + name + "=$", "mu"));
  }
  assert.match(
    wrangler,
    /"vars":\s*\{\s*"BETTER_AUTH_URL":\s*"https:\/\/taleswithoutend\.com"\s*\}/u,
  );
  assert.doesNotMatch(wrangler, /BETTER_AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|DISCORD_CLIENT_SECRET/u);
  assert.match(auth, /additionalFields:[\s\S]*role:[\s\S]*input: false/u);
  assert.match(auth, /defaultValue: "user"/u);
  assert.match(client, /inferAdditionalFields<Auth>/u);
});

test("request JSON parsing is bounded and rejects malformed input", async () => {
  const valid = await readBoundedJson(new Request("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  }), 64);
  assert.deepEqual(valid, { ok: true });
  await assert.rejects(
    readBoundedJson(new Request("https://example.invalid", { method: "POST", body: "{" }), 64),
    error => error instanceof RequestBodyError && error.status === 400,
  );
  await assert.rejects(
    readBoundedJson(new Request("https://example.invalid", { method: "POST", body: "x".repeat(65) }), 64),
    error => error instanceof RequestBodyError && error.status === 413,
  );
});

test("canonical auth configuration preserves Google scopes and adds only Discord identity scopes", async () => {
  const auth = await source("lib/auth.ts");
  const constants = await source("lib/auth-constants.ts");
  const fallbackRoute = await source("app/api/auth/[...all]/route.ts");
  assert.match(constants, /https:\/\/taleswithoutend\.com/u);
  assert.match(auth, /trustedOrigins: \[CANONICAL_ORIGIN, \.\.\.LOCAL_AUTH_ORIGINS\]/u);
  assert.match(auth, /disableDefaultScope: true[\s\S]*scope: \["openid", "email", "profile"\]/u);
  assert.match(auth, /emailAndPassword:\s*\{\s*enabled: false/u);
  assert.match(fallbackRoute, /Response\.redirect[\s\S]*CANONICAL_ORIGIN/u);
  assert.match(auth, /scope: \["identify", "email"\]/u);
  assert.match(auth, /disableImplicitLinking: true/u);
  assert.doesNotMatch(auth, /github|password:\s*true|scope:.*(?:bot|guilds)/u);
});

test("public URL format is stable, opaque, and independent of names", async () => {
  const page = await source("app/character-sheet.tsx");
  const route = await source("app/character/[publicId]/page.tsx");
  assert.match(page, /\/character\/\$\{id\}/u);
  assert.match(route, /CANONICAL_ORIGIN\}\/character\/\$\{publicId\}/u);
  assert.doesNotMatch(route, /ownerUserId|session\.user\.name|session\.user\.email/u);
});

test("regular character saves cannot replace server-controlled portrait references", async () => {
  const route = await source("app/api/characters/[id]/route.ts");
  const storage = await source("lib/characters/sanitize.ts");
  assert.match(route, /character\.portrait = typeof currentCharacter\.portrait/u);
  assert.match(storage, /clean\.portrait = ""/u);
});

test("production migration and admin commands fail closed", async () => {
  const migration = await source("scripts/migrate-production.mjs");
  const admin = await source("scripts/d1-admin.mjs");
  const promotion = await source("scripts/promote-admin.mjs");
  assert.match(migration, /if \(!remote \|\| !apply\)/u);
  assert.match(admin, /--confirm-database-id/u);
  assert.match(admin, /containsDatabaseId\(info\)/u);
  assert.match(promotion, /process\.env\.TWE_ADMIN_EMAIL/u);
  assert.match(promotion, /matchingUsers\.length !== 1/u);
  assert.match(promotion, /UPDATE user SET role = 'admin'/u);
  assert.doesNotMatch(promotion, /console\.log\([^\n]*\$\{(?:email|id)\}/u);
});


test("auth is request-scoped, uses the concrete D1 binding, and has no temporary diagnostics", async () => {
  const auth = await source("lib/auth.ts");
  const asyncStorage = await source("lib/better-auth-cloudflare.ts");
  const route = await source("app/api/auth/[...all]/route.ts");
  const session = await source("lib/auth-session.ts");

  assert.match(auth, /export function createAuth\(runtimeEnv/u);
  assert.match(auth, /database: runtimeEnv\.DB/u);
  assert.doesNotMatch(auth, /cloudflare:workers|export const auth|instrumentAuthDatabase/u);
  assert.match(route, /createAuth\(env\)\.handler\(request\)/u);
  assert.match(session, /createAuth\(env\)\.api\.getSession/u);
  assert.match(asyncStorage, /import \{ AsyncLocalStorage \} from "node:async_hooks"/u);
  for (const storage of [
    "adapterAsyncStorage",
    "endpointContextAsyncStorage",
    "requestStateAsyncStorage",
  ]) {
    assert.match(asyncStorage, new RegExp(`${storage} \\?\\?= new AsyncLocalStorage`, "u"));
  }

  const combined = `${auth}\n${route}\n${session}\n${asyncStorage}`;
  for (const diagnostic of [
    "auth_route_enter",
    "auth_bindings_valid",
    "auth_instance_create_start",
    "auth_context_create_start",
    "auth_handler_start",
    "auth_next_handler_await_start",
    "auth_d1_operation_start",
  ]) {
    assert.doesNotMatch(combined, new RegExp(diagnostic, "u"));
  }
});

test("temporary client auth diagnostics are removed", async () => {
  const page = await source("app/character-sheet.tsx");
  assert.doesNotMatch(page, /auth-header-button|auth-library-button|auth-sign-out-button/u);
  assert.doesNotMatch(page, /console\.(?:log|debug|error)\(\s*["']\[auth/u);
});
