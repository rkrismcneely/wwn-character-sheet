import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  E2E_AUTH_SECRET,
  E2E_ORIGIN,
  e2eFixtureSql,
} from "../tests/e2e/fixtures.mjs";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const serverRoot = resolve(projectRoot, "dist/server");
const temporaryRoot = mkdtempSync(`${tmpdir()}/twe-playwright-`);
const persistence = resolve(temporaryRoot, "state");
const port = new URL(E2E_ORIGIN).port;

for (const directory of ["home", "config", "state"]) {
  mkdirSync(resolve(temporaryRoot, directory), { recursive: true });
}

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
execFileSync(
  wrangler,
  [
    "d1",
    "migrations",
    "apply",
    "wwn-character-sheet-db",
    "--local",
    "--config",
    resolve(projectRoot, "wrangler.jsonc"),
    "--persist-to",
    persistence,
  ],
  { cwd: projectRoot, env: environment, stdio: "inherit" },
);

execFileSync(
  wrangler,
  [
    "d1",
    "execute",
    "wwn-character-sheet-db",
    "--local",
    "--config",
    resolve(projectRoot, "wrangler.jsonc"),
    "--persist-to",
    persistence,
    "--command",
    e2eFixtureSql(),
  ],
  { cwd: projectRoot, env: environment, stdio: "inherit" },
);

const worker = spawn(
  wrangler,
  [
    "dev",
    "--config",
    "wrangler.json",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--persist-to",
    persistence,
    "--log-level",
    "warn",
    "--show-interactive-dev-session",
    "false",
    "--var",
    `BETTER_AUTH_SECRET:${E2E_AUTH_SECRET}`,
    "--var",
    `BETTER_AUTH_URL:${E2E_ORIGIN}`,
    "--var",
    "GOOGLE_CLIENT_ID:e2e-only.apps.googleusercontent.com",
    "--var",
    "GOOGLE_CLIENT_SECRET:e2e-only-google-secret",
  ],
  {
    cwd: serverRoot,
    env: environment,
    stdio: "inherit",
  },
);

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (worker.exitCode === null) worker.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

worker.once("error", error => {
  console.error(error);
  rmSync(temporaryRoot, { recursive: true, force: true });
  process.exitCode = 1;
});

worker.once("exit", code => {
  rmSync(temporaryRoot, { recursive: true, force: true });
  process.exit(stopping ? 0 : (code ?? 1));
});
