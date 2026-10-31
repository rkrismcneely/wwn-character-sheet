/**
 * One-time production bootstrap for the GM-owned recap encryption key.
 *
 * Never overwrite or rotate an existing Cloudflare Worker secret. Existing Drive
 * refresh tokens and Gemini API keys depend on this exact key for decryption.
 *
 * No secret material is written to GitHub, build logs, or the repository.
 * Cloudflare holds the randomly generated value as a Worker secret.
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const NAME = "RECAP_STORAGE_ENCRYPTION_KEY";
const WORKER = "wwn-character-sheet";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  WRANGLER_WRITE_LOGS: "false",
};
if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("Cloudflare deployment credentials unavailable; no secret was changed.");
}
function names() {
  // A failed list check must NEVER be interpreted as 'no secret', since it
  // could otherwise cause an unsafe key rotation.
  const raw = execFileSync(wrangler, [
    "secret", "list", "--config", "wrangler.jsonc", "--name", WORKER, "--format", "json",
  ], { cwd: process.cwd(), env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  let entries;
  try { entries = JSON.parse(raw); }
  catch { throw new Error("Cloudflare did not provide a valid secret listing. Refusing to change any keys."); }
  if (!Array.isArray(entries) || entries.some(item => !item || typeof item.name !== "string")) {
    throw new Error("Unexpected Cloudflare secret listing. Refusing to change any keys.");
  }
  return new Set(entries.map(item => item.name));
}

if (names().has(NAME)) {
  console.log("Recap encryption secret already exists; preserving it unchanged.");
} else {
  // Exactly 256 bits of cryptographic randomness, as 43 unpadded base64url chars.
  // Never log, print, store in process.env, or commit this value.
  const secret = randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(secret)) {
    throw new Error("Generated encryption key did not meet the expected format.");
  }
  execFileSync(wrangler, [
    "secret", "put", NAME, "--config", "wrangler.jsonc", "--name", WORKER,
  ], { cwd: process.cwd(), env, input: secret, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
  if (!names().has(NAME)) {
    throw new Error("Cloudflare did not confirm the new recap encryption secret.");
  }
  console.log("Recap encryption secret created and verified on the production Worker.");
  console.log("This secret must not be deleted or rotated without migrating encrypted user credentials.");
}
