import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const DATABASE_NAME = "wwn-character-sheet-db";
export const DATABASE_ID = "8e2bf197-e20f-4ea7-a86f-cab4e1a74699";

const wrangler = resolve("node_modules/.bin/wrangler");
const baseEnvironment = {
  ...process.env,
  WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  WRANGLER_WRITE_LOGS: "false",
};

export function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

export function optionValues(name) {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .filter((argument) => argument.startsWith(prefix))
    .map((argument) => argument.slice(prefix.length));
}

export function optionValue(name) {
  return optionValues(name).at(-1);
}

export function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function runWrangler(args) {
  return execFileSync(wrangler, args, {
    cwd: process.cwd(),
    env: baseEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function containsDatabaseId(value) {
  if (value === DATABASE_ID) return true;
  if (Array.isArray(value)) return value.some(containsDatabaseId);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsDatabaseId);
  }
  return false;
}

export function operationMode() {
  const remote = hasFlag("--remote");
  const apply = hasFlag("--apply");
  if (remote) {
    const confirmation = optionValue("--confirm-database-id");
    if (confirmation !== DATABASE_ID) {
      throw new Error(
        `Remote mode requires --confirm-database-id=${DATABASE_ID}.`,
      );
    }
    const info = JSON.parse(
      runWrangler(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]),
    );
    if (!containsDatabaseId(info)) {
      throw new Error("The resolved remote D1 database ID does not match production.");
    }
  }
  return { remote, apply };
}

export function queryD1(sql, remote) {
  const output = runWrangler([
    "d1",
    "execute",
    DATABASE_NAME,
    remote ? "--remote" : "--local",
    "--config",
    "wrangler.jsonc",
    "--json",
    "--command",
    sql,
  ]);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success !== true)) {
    throw new Error("D1 did not report a successful query.");
  }
  return parsed.flatMap((entry) => entry.results ?? []);
}

export function executeD1(sql, remote) {
  queryD1(sql, remote);
}
