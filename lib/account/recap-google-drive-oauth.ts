import { CANONICAL_ORIGIN } from "../auth-constants.ts";
import { hashOpaqueToken, randomBase64URL } from "../security/opaque-tokens.ts";
import { CampaignServiceError } from "../campaigns/service.ts";

/**
 * Explicit Drive authorization, separate from the app's Google sign-in.
 * No plaintext OAuth credentials are persisted or returned to the browser.
 */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_CALLBACK = CANONICAL_ORIGIN + "/api/account/storage/google-drive/callback";
export const DRIVE_STATE_LIFETIME_MS = 10 * 60 * 1000;
const OAUTH_STATE_COOKIE = "twe_drive_oauth";
type Settings = { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; RECAP_STORAGE_ENCRYPTION_KEY?: string };
const textEncoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function fromBase64url(value: string): Uint8Array {
  if (!/^[a-zA-Z0-9_-]{43}$/u.test(value)) throw new Error("Invalid credential key.");
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export function driveConfiguration(settings: Settings): boolean {
  return Boolean(settings.GOOGLE_CLIENT_ID && settings.GOOGLE_CLIENT_SECRET &&
    settings.RECAP_STORAGE_ENCRYPTION_KEY && /^[a-zA-Z0-9_-]{43}$/u.test(settings.RECAP_STORAGE_ENCRYPTION_KEY));
}
export function requireDriveConfiguration(settings: Settings): void {
  if (!driveConfiguration(settings)) throw new CampaignServiceError("Google Drive storage is not configured yet.", 409);
}
async function encryptionKey(settings: Settings): Promise<CryptoKey> {
  requireDriveConfiguration(settings);
  return crypto.subtle.importKey("raw", fromBase64url(settings.RECAP_STORAGE_ENCRYPTION_KEY!), "AES-GCM", false, ["encrypt", "decrypt"]);
}
function associatedData(userId: string, connectionId: string): Uint8Array {
  return textEncoder.encode("twe-recap-storage:v1:google-drive:" + userId + ":" + connectionId);
}
export async function encryptDriveRefreshToken(
  settings: Settings, userId: string, connectionId: string, refreshToken: string,
): Promise<{ ciphertext: string; nonce: string; version: 1 }> {
  if (!refreshToken || refreshToken.length > 8192) throw new Error("Invalid refresh credential.");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: "AES-GCM", iv: nonce, additionalData: associatedData(userId, connectionId),
  }, await encryptionKey(settings), textEncoder.encode(refreshToken));
  return { ciphertext: base64url(new Uint8Array(ciphertext)), nonce: base64url(nonce), version: 1 };
}
/** Server use only, e.g. for later Drive uploads / authorized audio streaming. */
export async function decryptDriveRefreshToken(
  settings: Settings, userId: string, connectionId: string,
  encrypted: { ciphertext: string; nonce: string; version: number },
): Promise<string> {
  if (encrypted.version !== 1) throw new Error("Unsupported credential version.");
  const nonce = encrypted.nonce;
  if (!/^[a-zA-Z0-9_-]{16}$/u.test(nonce)) throw new Error("Invalid credential nonce.");
  const bytes = (value: string): Uint8Array => {
    const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };
  const plain = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: bytes(nonce), additionalData: associatedData(userId, connectionId),
  }, await encryptionKey(settings), bytes(encrypted.ciphertext));
  return new TextDecoder().decode(plain);
}
export function newDriveState(): string { return randomBase64URL(32); }
export async function storeDriveState(db: D1Database, userId: string, state: string, now = Date.now()): Promise<void> {
  await db.prepare("INSERT INTO user_recap_storage_oauth_states (state_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(await hashOpaqueToken(state), userId, now + DRIVE_STATE_LIFETIME_MS, now).run();
}
export async function consumeDriveState(db: D1Database, userId: string, state: string, now = Date.now()): Promise<boolean> {
  if (state.length < 40 || state.length > 128) return false;
  const row = await db.prepare(
    "DELETE FROM user_recap_storage_oauth_states WHERE state_hash = ? AND user_id = ? AND expires_at > ? RETURNING user_id AS userId",
  ).bind(await hashOpaqueToken(state), userId, now).first<{userId:string}>();
  return row?.userId === userId;
}
export function stateCookie(state: string, clear = false): string {
  return OAUTH_STATE_COOKIE + "=" + (clear ? "" : state) +
    "; Path=/api/account/storage/google-drive; HttpOnly; Secure; SameSite=Lax; " +
    (clear ? "Max-Age=0" : "Max-Age=600");
}
export function hasDriveStateCookie(request: Request, state: string): boolean {
  const value = request.headers.get("cookie")?.split(";").map(x => x.trim())
    .find(x => x.startsWith(OAUTH_STATE_COOKIE + "="))?.slice(OAUTH_STATE_COOKIE.length+1);
  return Boolean(value && value.length === state.length &&
    /^[a-zA-Z0-9_-]{40,128}$/u.test(value) && value === state);
}
export function authorizationUrl(settings: Settings, state: string): string {
  requireDriveConfiguration(settings);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const query = url.searchParams;
  query.set("client_id", settings.GOOGLE_CLIENT_ID);
  query.set("redirect_uri", DRIVE_CALLBACK);
  query.set("response_type", "code");
  query.set("scope", DRIVE_SCOPE);
  query.set("access_type", "offline");
  query.set("prompt", "consent");
  query.set("state", state);
  return url.toString();
}
export type DriveTokenReply = { access_token: string; refresh_token: string; scope: string };
export async function exchangeDriveCode(settings: Settings, code: string): Promise<DriveTokenReply> {
  requireDriveConfiguration(settings);
  if (code.length < 1 || code.length > 2048) throw new Error("Invalid OAuth code.");
  const body = new URLSearchParams({
    code, client_id: settings.GOOGLE_CLIENT_ID, client_secret: settings.GOOGLE_CLIENT_SECRET,
    redirect_uri: DRIVE_CALLBACK, grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Google Drive authorization could not be completed.");
  const json = await response.json() as Partial<DriveTokenReply>;
  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string" ||
    typeof json.scope !== "string" || !json.scope.split(/\s+/u).includes(DRIVE_SCOPE)) {
    throw new Error("Drive authorization did not return offline access with the required scope.");
  }
  return json as DriveTokenReply;
}
export async function driveAccountLabel(accessToken: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)", {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Could not verify the selected Drive account.");
  const data = await response.json() as { user?: { emailAddress?: string; displayName?: string } };
  const label = data.user?.emailAddress || data.user?.displayName;
  return typeof label === "string" && label.trim() ? label.slice(0, 160) : "Google Drive";
}
