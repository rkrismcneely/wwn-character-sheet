import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

async function startLocalWorker({ auth = false } = {}) {
  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  const serverRoot = resolve(projectRoot, "dist/server");
  const temporaryRoot = mkdtempSync(`${tmpdir()}/wwn-phase4b-worker-`);
  for (const directory of ["home", "config", "state"]) {
    mkdirSync(resolve(temporaryRoot, directory), { recursive: true });
  }
  const port = await availablePort();
  const inspectorPort = await availablePort();
  const environment = {
    ...process.env,
    HOME: resolve(temporaryRoot, "home"),
    XDG_CONFIG_HOME: resolve(temporaryRoot, "config"),
    CI: "true",
    WRANGLER_LOG_PATH: resolve(temporaryRoot, "wrangler.log"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
  };
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    delete environment[name];
  }

  const wrangler = resolve(projectRoot, "node_modules/.bin/wrangler");
  const sourceConfig = resolve(projectRoot, "wrangler.jsonc");
  const persistence = resolve(temporaryRoot, "state");
  execFileSync(wrangler, [
    "d1",
    "migrations",
    "apply",
    "wwn-character-sheet-db",
    "--local",
    "--config",
    sourceConfig,
    "--persist-to",
    persistence,
  ], { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const fixtureIds = {
    public: `chr_${"P".repeat(22)}`,
    unlisted: `chr_${"U".repeat(22)}`,
    private: `chr_${"R".repeat(22)}`,
    legacy: `chr_${"L".repeat(22)}`,
    normalOwn: `chr_${"N".repeat(22)}`,
    normalDelete: `chr_${"D".repeat(22)}`,
    adminOwn: `chr_${"A".repeat(22)}`,
    campaign: `cmp_${"C".repeat(22)}`,
  };
  const authSecret = "local-runtime-proof-secret-2026-08-10-very-long";
  const authSessionToken = "runtime-proof-session-token";
  const adminSessionToken = "runtime-admin-session-token";
  const inserts = [
    ["fixture-public", "other-owner", fixtureIds.public, "public", "Public Scout"],
    ["fixture-unlisted", "other-owner", fixtureIds.unlisted, "unlisted", "Unlisted Mage"],
    ["fixture-private", "other-owner", fixtureIds.private, "private", "Private Expert"],
    ["fixture-legacy", null, fixtureIds.legacy, "private", "Legacy Wanderer"],
    ["fixture-normal-own", "runtime-proof-user", fixtureIds.normalOwn, "private", "Normal Owner"],
    ["fixture-normal-delete", "runtime-proof-user", fixtureIds.normalDelete, "private", "Normal Delete"],
    ["fixture-admin-own", "runtime-admin", fixtureIds.adminOwn, "private", "Admin Owner"],
  ];
  const userInserts = `
    INSERT INTO user
      (id, name, email, email_verified, role, created_at, updated_at)
    VALUES
      ('runtime-proof-user', 'Runtime Proof', 'runtime-proof@example.invalid',
       1, 'user', 1786348800000, 1786348800000),
      ('runtime-admin', 'Runtime Admin', 'runtime-admin@example.invalid',
       1, 'admin', 1786348800000, 1786348800000),
      ('other-owner', 'Other Owner', 'other-owner@example.invalid',
       1, 'user', 1786348800000, 1786348800000);
  `;
  const characterInserts = inserts.map(([id, ownerUserId, publicId, visibility, name]) => `
    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, portrait_key, name, player,
       class_label, level, data, version, created_at, updated_at)
    VALUES
      ('${id}', ${ownerUserId ? `'${ownerUserId}'` : "NULL"}, '${publicId}', '${visibility}', NULL, '${name}', '',
       'Expert', 1, '{"name":"${name}","level":1,"classOne":"Expert"}',
       1, '2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z');
  `).join("\n");
  const sessionInserts = auth ? `
    INSERT INTO session
      (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
    VALUES
      ('runtime-proof-session', 1893456000000, '${authSessionToken}',
       1786348800000, 1786348800000, '127.0.0.1', 'runtime-proof',
       'runtime-proof-user'),
      ('runtime-admin-session', 1893456000000, '${adminSessionToken}',
       1786348800000, 1786348800000, '127.0.0.1', 'runtime-admin',
       'runtime-admin');
  ` : "";
  const campaignInserts = auth ? `
    INSERT INTO campaigns
      (id, public_id, owner_user_id, name, description, version, created_at, updated_at)
    VALUES
      ('runtime-campaign', '${fixtureIds.campaign}', 'other-owner',
       'Runtime Company', NULL, 1, '2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z');
    INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
    VALUES
      ('runtime-campaign', 'other-owner', 'gm', '2026-08-04T00:00:00.000Z'),
      ('runtime-campaign', 'runtime-proof-user', 'player', '2026-08-04T00:00:00.000Z');
    INSERT INTO campaign_characters (campaign_id, character_id, added_at)
    VALUES ('runtime-campaign', 'fixture-private', '2026-08-04T00:00:00.000Z');
  ` : "";
  const fixtureSql = `${userInserts}\n${characterInserts}\n${campaignInserts}\n${sessionInserts}`;
  execFileSync(wrangler, [
    "d1",
    "execute",
    "wwn-character-sheet-db",
    "--local",
    "--config",
    sourceConfig,
    "--persist-to",
    persistence,
    "--command",
    fixtureSql,
  ], { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });

  const workerArguments = [
    "dev",
    "--config",
    "wrangler.json",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    String(inspectorPort),
    "--persist-to",
    persistence,
    "--log-level",
    "info",
    "--show-interactive-dev-session",
    "false",
  ];
  if (auth) {
    workerArguments.push(
      "--var",
      `BETTER_AUTH_SECRET:${authSecret}`,
      "--var",
      `BETTER_AUTH_URL:http://127.0.0.1:${port}`,
      "--var",
      "GOOGLE_CLIENT_ID:local-runtime-proof.apps.googleusercontent.com",
      "--var",
      "GOOGLE_CLIENT_SECRET:local-runtime-proof-secret",
    );
  }
  const child = spawn(wrangler, workerArguments, {
    cwd: serverRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const ready = new Promise((resolveReady, reject) => {
    const collect = chunk => {
      output += String(chunk);
      if (output.includes("Ready on")) resolveReady();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("exit", code => reject(new Error(`Local Worker exited with ${code}.\n${output}`)));
    child.once("error", reject);
  });
  let readinessTimer;
  try {
    await Promise.race([
      ready,
      new Promise((_, reject) => {
        readinessTimer = setTimeout(() => reject(new Error(`Local Worker timed out.\n${output}`)), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(readinessTimer);
  }

  return {
    origin: `http://127.0.0.1:${port}`,
    fixtureIds,
    authSecret,
    authSessionToken,
    adminSessionToken,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolveExit => child.once("exit", resolveExit)),
        new Promise(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

function authenticatedHeaders(worker, sessionToken) {
  const signature = createHmac("sha256", worker.authSecret)
    .update(sessionToken)
    .digest("base64");
  return {
    cookie: `better-auth.session_token=${encodeURIComponent(`${sessionToken}.${signature}`)}`,
    origin: worker.origin,
  };
}

test("local Worker renders the signed-out UI and rejects protected writes", { timeout: 90_000 }, async () => {
  const worker = await startLocalWorker();
  try {
    const response = await fetch(`${worker.origin}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, developmentPreviewMeta);
    assert.match(html, /Sign in with Google/u);
    assert.match(html, /Public Characters/u);

    const publicLibrary = await fetch(`${worker.origin}/api/characters?scope=public`);
    assert.equal(publicLibrary.status, 200);
    const publicLibraryPayload = await publicLibrary.json();
    assert.deepEqual(publicLibraryPayload.characters.map(character => character.name), ["Public Scout"]);
    assert.equal(JSON.stringify(publicLibraryPayload).includes("ownerUserId"), false);

    for (const [visibility, expectedStatus] of [
      ["public", 200],
      ["unlisted", 200],
      ["private", 404],
    ]) {
      const id = worker.fixtureIds[visibility];
      const characterResponse = await fetch(`${worker.origin}/api/characters/${id}`);
      assert.equal(characterResponse.status, expectedStatus, `${visibility} API visibility`);
      const pageResponse = await fetch(`${worker.origin}/character/${id}`);
      assert.equal(pageResponse.status, expectedStatus, `${visibility} page visibility`);
      if (expectedStatus === 200) {
        const pageHTML = await pageResponse.text();
        assert.match(pageHTML, /Read-only character/u);
        assert.doesNotMatch(pageHTML, /ownerUserId|owner_user_id|example\.invalid/u);
      }
    }

    for (const [pathname, method, body] of [
      ["/api/characters", "POST", { character: { name: "Denied" } }],
      ["/api/characters/import", "POST", { name: "Denied" }],
      ["/api/characters/chr_AAAAAAAAAAAAAAAAAAAAAA", "PUT", { character: {}, version: 1 }],
      ["/api/characters/chr_AAAAAAAAAAAAAAAAAAAAAA", "DELETE", undefined],
      ["/api/legacy-claims", "POST", { token: `claim_${"A".repeat(43)}` }],
    ]) {
      let denied;
      let denial = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        denied = await fetch(`${worker.origin}${pathname}`, {
          method,
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        denial = await denied.text();
        if (denied.status !== 503 || !denial.includes("worker restarted mid-request")) break;
        await new Promise(resolveWait => setTimeout(resolveWait, 100));
      }
      assert.equal(denied.status, 401, `${method} ${pathname} must require sign-in: ${denial}`);
    }

    let authUnavailable;
    let authDenial = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      authUnavailable = await fetch(`${worker.origin}/api/auth/get-session`);
      authDenial = await authUnavailable.text();
      if (
        authUnavailable.status !== 503
        || !authDenial.includes("worker restarted mid-request")
      ) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.equal(authUnavailable.status, 503);
    assert.deepEqual(JSON.parse(authDenial), {
      error: "Authentication is temporarily unavailable.",
    });
    let output = worker.output();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (output.includes('"event":"auth_runtime_unavailable"')) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
      output = worker.output();
    }
    assert.match(output, /"event":"auth_runtime_unavailable"/u);
    assert.match(output, /"errorType":"AuthConfigurationError"/u);
    for (const binding of [
      "BETTER_AUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      assert.match(output, new RegExp(`"${binding}"`, "u"));
    }
    assert.doesNotMatch(output, /authorization|cookie|session_token/iu);
  } finally {
    await worker.stop();
  }
});

test("local Worker enforces read-only administrator access", { timeout: 90_000 }, async () => {
  const worker = await startLocalWorker({ auth: true });
  try {
    const normalHeaders = authenticatedHeaders(worker, worker.authSessionToken);
    const adminHeaders = authenticatedHeaders(worker, worker.adminSessionToken);

    const normalRoot = await fetch(`${worker.origin}/`, { headers: normalHeaders });
    assert.equal(normalRoot.status, 200);
    const normalRootHTML = await normalRoot.text();
    assert.match(normalRootHTML, /My Characters/u);
    assert.match(normalRootHTML, /Create New Character/u);
    assert.match(normalRootHTML, /Claim a legacy character/u);
    assert.doesNotMatch(normalRootHTML, /Your Adventures\.<br/u);
    const mine = await fetch(`${worker.origin}/api/characters?scope=mine`, { headers: normalHeaders });
    assert.equal(mine.status, 200);
    const minePayload = await mine.json();
    assert.deepEqual(minePayload.characters.map(character => character.name), ["Normal Delete", "Normal Owner"]);
    assert.equal(JSON.stringify(minePayload).includes("other-owner@example.invalid"), false);
    assert.equal(JSON.stringify(minePayload).includes("ownerUserId"), false);

    const normalOwn = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalOwn}`,
      { headers: normalHeaders },
    );
    assert.equal(normalOwn.status, 200);
    assert.equal((await normalOwn.json()).permissions.canEdit, true);

    const normalPrivate = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.private}`,
      { headers: normalHeaders },
    );
    assert.equal(normalPrivate.status, 404);
    const campaignLibrary = await fetch(
      `${worker.origin}/api/campaigns/${worker.fixtureIds.campaign}/characters`,
      { headers: normalHeaders },
    );
    assert.equal(campaignLibrary.status, 200);
    const campaignLibraryPayload = await campaignLibrary.json();
    assert.deepEqual(
      campaignLibraryPayload.characters.map(character => character.name),
      ["Private Expert"],
    );
    assert.equal(campaignLibraryPayload.characters[0].permissions.canEdit, false);
    assert.equal(JSON.stringify(campaignLibraryPayload).includes("other-owner"), false);

    const campaignPrivate = await fetch(
      `${worker.origin}/api/campaigns/${worker.fixtureIds.campaign}/characters/${worker.fixtureIds.private}`,
      { headers: normalHeaders },
    );
    assert.equal(campaignPrivate.status, 200);
    const campaignPrivatePayload = await campaignPrivate.json();
    assert.equal(campaignPrivatePayload.permissions.canEdit, false);
    assert.equal(campaignPrivatePayload.campaignContext.readOnly, true);

    const campaignPrivatePage = await fetch(
      `${worker.origin}/campaigns/${worker.fixtureIds.campaign}/characters/${worker.fixtureIds.private}`,
      { headers: normalHeaders },
    );
    assert.equal(campaignPrivatePage.status, 200);
    assert.match(await campaignPrivatePage.text(), /Viewing through campaign · Read only/u);

    const deniedCampaignMutation = await fetch(
      `${worker.origin}/api/campaigns/${worker.fixtureIds.campaign}/characters/${worker.fixtureIds.private}`,
      { method: "PUT", headers: { ...normalHeaders, "content-type": "application/json" }, body: "{}" },
    );
    assert.equal(deniedCampaignMutation.status, 405);
    const deniedOtherLink = await fetch(
      `${worker.origin}/api/campaigns/${worker.fixtureIds.campaign}/characters`,
      {
        method: "POST",
        headers: { ...normalHeaders, "content-type": "application/json" },
        body: JSON.stringify({ characterId: worker.fixtureIds.private }),
      },
    );
    assert.equal(deniedOtherLink.status, 403);
    const ownLink = await fetch(
      `${worker.origin}/api/campaigns/${worker.fixtureIds.campaign}/characters`,
      {
        method: "POST",
        headers: { ...normalHeaders, "content-type": "application/json" },
        body: JSON.stringify({ characterId: worker.fixtureIds.normalOwn }),
      },
    );
    assert.equal(ownLink.status, 201);
    for (const query of ["scope=all", "scope=all&role=admin", "scope=all&isAdmin=true"]) {
      const denied = await fetch(`${worker.origin}/api/characters?${query}`, {
        headers: normalHeaders,
      });
      assert.equal(denied.status, 403, query);
    }
    assert.equal(
      (await fetch(`${worker.origin}/api/characters?scope=all`)).status,
      401,
    );

    const allResponse = await fetch(`${worker.origin}/api/characters?scope=all`, {
      headers: adminHeaders,
    });
    assert.equal(allResponse.status, 200);
    const allPayload = await allResponse.json();
    assert.equal(allPayload.characters.length, 7);
    assert.equal(JSON.stringify(allPayload).includes("ownerUserId"), false);
    assert.equal(JSON.stringify(allPayload).includes("example.invalid"), false);
    assert.equal(
      allPayload.characters.find(character => character.id === worker.fixtureIds.legacy).ownerState,
      "unowned",
    );
    assert.equal(
      allPayload.characters.find(character => character.id === worker.fixtureIds.adminOwn).ownerState,
      "mine",
    );
    assert.equal(
      allPayload.characters.find(character => character.id === worker.fixtureIds.private).ownerState,
      "other",
    );

    for (const visibility of ["public", "unlisted", "private", "legacy"]) {
      const response = await fetch(
        `${worker.origin}/api/characters/${worker.fixtureIds[visibility]}`,
        { headers: adminHeaders },
      );
      assert.equal(response.status, 200, `admin ${visibility} read`);
      const payload = await response.json();
      assert.equal(payload.permissions.canEdit, false);
      assert.equal(payload.permissions.adminReadOnly, true);
    }
    const adminPage = await fetch(
      `${worker.origin}/character/${worker.fixtureIds.private}`,
      { headers: adminHeaders },
    );
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /Viewing as administrator · Read only/u);

    const normalSave = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalOwn}`,
      {
        method: "PUT",
        headers: { ...normalHeaders, "content-type": "application/json" },
        body: JSON.stringify({ character: { name: "Normal Owner Updated" }, version: 1 }),
      },
    );
    assert.equal(normalSave.status, 200);
    const normalVisibility = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalOwn}`,
      {
        method: "PATCH",
        headers: { ...normalHeaders, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "unlisted" }),
      },
    );
    assert.equal(normalVisibility.status, 200);
    const portraitUpload = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalOwn}/portrait`,
      {
        method: "POST",
        headers: {
          ...normalHeaders,
          "content-type": "image/png",
          "x-character-version": "2",
        },
        body: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    );
    assert.equal(portraitUpload.status, 201);
    const portraitVersion = (await portraitUpload.json()).version;
    const portraitDelete = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalOwn}/portrait`,
      {
        method: "DELETE",
        headers: { ...normalHeaders, "x-character-version": String(portraitVersion) },
      },
    );
    assert.equal(portraitDelete.status, 200);
    const normalDelete = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.normalDelete}`,
      { method: "DELETE", headers: normalHeaders },
    );
    assert.equal(normalDelete.status, 200);

    const adminOwnSave = await fetch(
      `${worker.origin}/api/characters/${worker.fixtureIds.adminOwn}`,
      {
        method: "PUT",
        headers: { ...adminHeaders, "content-type": "application/json" },
        body: JSON.stringify({ character: { name: "Admin Owner Updated" }, version: 1 }),
      },
    );
    assert.equal(adminOwnSave.status, 200);

    for (const [id, method, body, expectedStatus] of [
      [worker.fixtureIds.private, "PUT", { character: { name: "Denied" }, version: 1 }, 404],
      [worker.fixtureIds.unlisted, "PATCH", { visibility: "private" }, 403],
      [worker.fixtureIds.public, "DELETE", undefined, 403],
    ]) {
      const response = await fetch(`${worker.origin}/api/characters/${id}`, {
        method,
        headers: body
          ? { ...adminHeaders, "content-type": "application/json" }
          : adminHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, expectedStatus, `admin ${method} other character`);
    }
    for (const method of ["POST", "DELETE"]) {
      const response = await fetch(
        `${worker.origin}/api/characters/${worker.fixtureIds.public}/portrait`,
        {
          method,
          headers: {
            ...adminHeaders,
            "content-type": "image/png",
            "x-character-version": "1",
          },
          body: method === "POST"
            ? Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            : undefined,
        },
      );
      assert.equal(response.status, 403, `admin ${method} other portrait`);
    }
    const claim = await fetch(`${worker.origin}/api/legacy-claims`, {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ token: `claim_${"C".repeat(43)}` }),
    });
    assert.notEqual(claim.status, 200);

    const adminSession = await fetch(`${worker.origin}/api/auth/get-session`, {
      headers: adminHeaders,
    });
    assert.equal(adminSession.status, 200);
    assert.equal((await adminSession.json()).user.role, "admin");
  } finally {
    await worker.stop();
  }
});

test("local Worker signs out an authenticated session and reports the request", { timeout: 90_000 }, async () => {
  const worker = await startLocalWorker({ auth: true });
  try {
    const headers = authenticatedHeaders(worker, worker.authSessionToken);

    const before = await fetch(`${worker.origin}/api/auth/get-session`, { headers });
    assert.equal(before.status, 200);
    assert.equal((await before.json()).user.id, "runtime-proof-user");

    const signOut = await fetch(`${worker.origin}/api/auth/sign-out`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(signOut.status, 200);
    assert.deepEqual(await signOut.json(), { success: true });

    const after = await fetch(`${worker.origin}/api/auth/get-session`, { headers });
    assert.equal(after.status, 200);
    assert.equal(await after.json(), null);

    const signIn = await fetch(`${worker.origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin: worker.origin, "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    assert.equal(signIn.status, 200);
    const signInPayload = await signIn.json();
    assert.equal(signInPayload.redirect, true);
    assert.match(signInPayload.url, /^https:\/\/accounts\.google\.com\//u);

    await new Promise(resolveWait => setTimeout(resolveWait, 100));
    assert.match(worker.output(), /POST \/api\/auth\/sign-out 200 OK/u);
    assert.match(worker.output(), /POST \/api\/auth\/sign-in\/social 200 OK/u);
  } finally {
    await worker.stop();
  }
});
