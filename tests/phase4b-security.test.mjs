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
  generateLegacyClaimToken,
  generatePublicCharacterId,
  hashLegacyClaimToken,
  isPlausibleLegacyClaimToken,
  isPlausiblePublicCharacterId,
} from "../lib/characters/identifiers.ts";
import {
  characterForStorage,
  parseCharacterImport,
  safeCharacterExport,
} from "../lib/characters/sanitize.ts";
import {
  isPortraitContentType,
  portraitBytesMatchContentType,
  portraitObjectKey,
  validPortraitObjectKey,
} from "../lib/characters/portraits.ts";
import {
  claimLegacyCharacters,
  LegacyClaimError,
} from "../lib/characters/claims.ts";
import { readBoundedJson, RequestBodyError } from "../lib/http-json.ts";

const owner = { userId: "user-owner" };
const otherUser = { userId: "user-other" };
const privateCharacter = { ownerUserId: owner.userId, visibility: "private" };
const unlistedCharacter = { ownerUserId: owner.userId, visibility: "unlisted" };
const publicCharacter = { ownerUserId: owner.userId, visibility: "public" };

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("missing session cannot create a character", async () => {
  const route = await source("app/api/characters/route.ts");
  assert.match(route, /export async function POST[\s\S]*getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
});

test("missing session cannot import a character", async () => {
  const route = await source("app/api/characters/import/route.ts");
  assert.match(route, /getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
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

test("signed-out user can view a public character", () => {
  assert.equal(canReadCharacter(null, publicCharacter), true);
});

test("signed-out user can view an unlisted character at its exact URL", () => {
  assert.equal(canReadCharacter(null, unlistedCharacter), true);
});

test("private character is hidden from public library and search", async () => {
  assert.equal(isPubliclyDiscoverable(privateCharacter), false);
  const database = await source("app/api/characters/db.ts");
  assert.match(database, /WHERE visibility = 'public' AND public_id IS NOT NULL/u);
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
  assert.ok(ids.every(id => id.length === 26 && !/\d{8,}/u.test(id)));
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

test("imported ownership, auth, email, and token fields are ignored at every depth", () => {
  const parsed = parseCharacterImport({
    format: "wwn-character-sheet",
    version: 1,
    character: {
      name: "Legacy",
      ownerUserId: "attacker",
      email: "hidden@example.invalid",
      session: { sessionToken: "secret" },
      companions: [{ id: "companion-ok", accountId: "remove-me" }],
    },
  });
  assert.deepEqual(parsed, {
    sourceVersion: 1,
    character: { name: "Legacy", companions: [{ id: "companion-ok" }] },
  });
});

test("v1, v2, and bare imports are supported but malformed versions fail", () => {
  assert.equal(parseCharacterImport({ format: "wwn-character-sheet", version: 1, character: { name: "One" } })?.sourceVersion, 1);
  assert.equal(parseCharacterImport({ format: "wwn-character-sheet", version: 2, character: { name: "Two" } })?.sourceVersion, 2);
  assert.equal(parseCharacterImport({ name: "Bare" })?.sourceVersion, null);
  assert.equal(parseCharacterImport({ format: "wwn-character-sheet", version: 99, character: {} }), null);
  assert.equal(parseCharacterImport([]), null);
});

test("imported characters receive a fresh server-generated public ID", async () => {
  const importRoute = await source("app/api/characters/import/route.ts");
  const database = await source("app/api/characters/db.ts");
  assert.match(importRoute, /createOwnedCharacter/u);
  assert.match(database, /const publicId = generatePublicCharacterId\(\)/u);
  assert.match(database, /VALUES \(\?, \?, \?, 'private'/u);
});

test("public output and exports omit owner, account, email, session, and internal portrait data", () => {
  const clean = safeCharacterExport({
    name: "Safe",
    ownerUserId: "owner",
    email: "owner@example.invalid",
    googleSubjectId: "google-id",
    sessionToken: "session",
    claimToken: "claim",
    portrait: "/api/portraits/portraits/opaque/internal.jpg",
  });
  assert.deepEqual(clean, { name: "Safe", portrait: "" });
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

class FakeClaimStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    const [tokenHash] = this.values;
    const claim = this.database.claim;
    if (tokenHash !== claim.tokenHash) return null;
    return {
      id: claim.id,
      expiresAt: claim.expiresAt,
      claimedAt: claim.claimedAt,
      revokedAt: claim.revokedAt,
      itemCount: this.database.characters.length,
      ownedCount: this.database.characters.filter(character => character.ownerUserId).length,
      missingPublicIdCount: this.database.characters.filter(character => !character.publicId).length,
    };
  }

  async all() {
    const [claimId, userId] = this.values;
    return {
      results: claimId === this.database.claim.id
        ? this.database.characters
            .filter(character => character.ownerUserId === userId)
            .map(({ publicId, name }) => ({ publicId, name }))
        : [],
    };
  }
}

class FakeClaimDatabase {
  constructor(tokenHash) {
    this.claim = {
      id: "claim-id",
      tokenHash,
      expiresAt: "2030-01-01T00:00:00.000Z",
      claimedAt: null,
      revokedAt: null,
      claimedByUserId: null,
    };
    this.characters = [{ publicId: generatePublicCharacterId(), name: "Legacy", ownerUserId: null }];
    this.queue = Promise.resolve();
  }

  prepare(sql) {
    return new FakeClaimStatement(this, sql);
  }

  async batch(statements) {
    const operation = this.queue.then(async () => {
      const claimStatement = statements[0];
      const [claimedAt, userId, claimId, tokenHash, minimumExpiry] = claimStatement.values;
      const claimCanChange = this.claim.id === claimId
        && this.claim.tokenHash === tokenHash
        && this.claim.claimedAt === null
        && this.claim.revokedAt === null
        && this.claim.expiresAt > minimumExpiry
        && this.characters.every(character => character.ownerUserId === null);
      if (claimCanChange) {
        this.claim.claimedAt = claimedAt;
        this.claim.claimedByUserId = userId;
      }

      const characterStatement = statements[1];
      const [characterOwner, selectedClaimId, selectedHash, selectedUser, selectedAt] = characterStatement.values;
      let characterChanges = 0;
      if (
        claimCanChange
        && selectedClaimId === this.claim.id
        && selectedHash === this.claim.tokenHash
        && selectedUser === this.claim.claimedByUserId
        && selectedAt === this.claim.claimedAt
      ) {
        for (const character of this.characters) {
          if (character.ownerUserId === null) {
            character.ownerUserId = characterOwner;
            characterChanges += 1;
          }
        }
      }
      return [{ meta: { changes: Number(claimCanChange) } }, { meta: { changes: characterChanges } }];
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}

async function claimFixture() {
  const token = generateLegacyClaimToken();
  assert.equal(isPlausibleLegacyClaimToken(token), true);
  return { token, database: new FakeClaimDatabase(await hashLegacyClaimToken(token)) };
}

test("claim token is single-use", async () => {
  const { token, database } = await claimFixture();
  const claimed = await claimLegacyCharacters(database, owner, token, new Date("2029-01-01T00:00:00.000Z"));
  assert.equal(claimed.length, 1);
  await assert.rejects(
    claimLegacyCharacters(database, owner, token, new Date("2029-01-01T00:00:01.000Z")),
    error => error instanceof LegacyClaimError && error.status === 409,
  );
});

test("claim token cannot be used while signed out", async () => {
  const route = await source("app/api/legacy-claims/route.ts");
  assert.match(route, /getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
});

test("claim token cannot be reused or raced successfully", async () => {
  const { token, database } = await claimFixture();
  const outcomes = await Promise.allSettled([
    claimLegacyCharacters(database, owner, token, new Date("2029-01-01T00:00:00.000Z")),
    claimLegacyCharacters(database, otherUser, token, new Date("2029-01-01T00:00:00.000Z")),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
  assert.ok(database.characters.every(character => character.ownerUserId === database.claim.claimedByUserId));
});

test("visible Google sign-in controls keep direct Better Auth click paths", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /!signedIn && !libraryOpen && <button[\s\S]*className="primary-action account-signin"[\s\S]*source: "header"[\s\S]*authClient\.signIn\.social\(\{[\s\S]*provider: "google"/u);
  assert.match(page, /className="library-signin"[\s\S]*source: "library"[\s\S]*authClient\.signIn\.social\(\{[\s\S]*provider: "google"/u);
});

test("sign-out removes access to owner-only operations", async () => {
  assert.deepEqual(authorizeCharacterWrite(owner, privateCharacter), { allowed: true });
  assert.deepEqual(authorizeCharacterWrite(null, privateCharacter), { allowed: false, status: 401 });
  const page = await source("app/page.tsx");
  assert.match(page, /className="account-signout"[\s\S]*\[auth-sign-out-button\] direct click[\s\S]*authClient\.signOut\(\)[\s\S]*setLocallySignedOut\(true\)[\s\S]*setCloudCanEdit\(false\)[\s\S]*refetchSession\(\)/u);
  assert.match(page, /Sign out failed:/u);
});

test("auth build configuration references runtime binding names without secret values", async () => {
  const auth = await source("lib/auth.ts");
  const client = await source("lib/auth-client.ts");
  const example = await source(".dev.vars.example");
  const wrangler = await source("wrangler.jsonc");
  assert.match(auth, /env\.BETTER_AUTH_SECRET/u);
  assert.match(auth, /env\.GOOGLE_CLIENT_ID/u);
  assert.match(auth, /env\.GOOGLE_CLIENT_SECRET/u);
  assert.doesNotMatch(client, /SECRET|CLIENT_ID/u);
  assert.equal(example, "BETTER_AUTH_SECRET=\nBETTER_AUTH_URL=http://localhost:5173\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n");
  assert.match(
    wrangler,
    /"vars":\s*\{\s*"BETTER_AUTH_URL":\s*"https:\/\/taleswithoutend\.com"\s*\}/u,
  );
  assert.doesNotMatch(wrangler, /BETTER_AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/u);
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

test("canonical auth configuration has one production origin and Google-only scopes", async () => {
  const auth = await source("lib/auth.ts");
  const constants = await source("lib/auth-constants.ts");
  const fallbackRoute = await source("app/api/auth/[...all]/route.ts");
  assert.match(constants, /https:\/\/taleswithoutend\.com/u);
  assert.match(auth, /trustedOrigins: \[CANONICAL_ORIGIN, \.\.\.LOCAL_AUTH_ORIGINS\]/u);
  assert.match(auth, /disableDefaultScope: true[\s\S]*scope: \["openid", "email", "profile"\]/u);
  assert.match(auth, /emailAndPassword:\s*\{\s*enabled: false/u);
  assert.match(fallbackRoute, /Response\.redirect[\s\S]*CANONICAL_ORIGIN/u);
  assert.doesNotMatch(auth, /github|discord|password:\s*true/u);
});

test("public URL format is stable, opaque, and independent of names", async () => {
  const page = await source("app/page.tsx");
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

test("production migration and legacy admin commands fail closed", async () => {
  const migration = await source("scripts/migrate-production.mjs");
  const admin = await source("scripts/d1-admin.mjs");
  const claim = await source("scripts/create-legacy-claim.mjs");
  assert.match(migration, /if \(!remote \|\| !apply\)/u);
  assert.match(admin, /--confirm-database-id/u);
  assert.match(admin, /containsDatabaseId\(info\)/u);
  assert.match(claim, /private token output file must be outside the repository/u);
  assert.match(claim, /mode: 0o600/u);
  assert.doesNotMatch(claim, /console\.log\(\s*token\s*\)/u);
});
