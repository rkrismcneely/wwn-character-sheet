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
  };
  const authSecret = "local-runtime-proof-secret-2026-08-10-very-long";
  const authSessionToken = "runtime-proof-session-token";
  const inserts = [
    ["fixture-public", fixtureIds.public, "public", "Public Scout"],
    ["fixture-unlisted", fixtureIds.unlisted, "unlisted", "Unlisted Mage"],
    ["fixture-private", fixtureIds.private, "private", "Private Expert"],
  ].map(([id, publicId, visibility, name]) => `
    INSERT INTO characters
      (id, owner_user_id, public_id, visibility, portrait_key, name, player,
       class_label, level, data, version, created_at, updated_at)
    VALUES
      ('${id}', NULL, '${publicId}', '${visibility}', NULL, '${name}', '',
       'Expert', 1, '{"name":"${name}","level":1,"classOne":"Expert"}',
       1, '2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z');
  `).join("\n") + (auth ? `
    INSERT INTO user
      (id, name, email, email_verified, created_at, updated_at)
    VALUES
      ('runtime-proof-user', 'Runtime Proof', 'runtime-proof@example.invalid',
       1, 1786348800000, 1786348800000);
    INSERT INTO session
      (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
    VALUES
      ('runtime-proof-session', 1893456000000, '${authSessionToken}',
       1786348800000, 1786348800000, '127.0.0.1', 'runtime-proof',
       'runtime-proof-user');
  ` : "");
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
    inserts,
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

    const authUnavailable = await fetch(`${worker.origin}/api/auth/get-session`);
    assert.equal(authUnavailable.status, 503);
  } finally {
    await worker.stop();
  }
});

test("local Worker signs out an authenticated session and reports the request", { timeout: 90_000 }, async () => {
  const worker = await startLocalWorker({ auth: true });
  try {
    const signature = createHmac("sha256", worker.authSecret)
      .update(worker.authSessionToken)
      .digest("base64");
    const signedToken = encodeURIComponent(`${worker.authSessionToken}.${signature}`);
    const headers = {
      cookie: `better-auth.session_token=${signedToken}`,
      origin: worker.origin,
    };

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
