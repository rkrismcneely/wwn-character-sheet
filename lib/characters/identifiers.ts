const PUBLIC_ID_BYTES = 16;
const CLAIM_TOKEN_BYTES = 32;

function randomBase64URL(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function generatePublicCharacterId(): string {
  return `chr_${randomBase64URL(PUBLIC_ID_BYTES)}`;
}

export function isPlausiblePublicCharacterId(value: string): boolean {
  return /^chr_[A-Za-z0-9_-]{22}$/u.test(value);
}

export function generateLegacyClaimToken(): string {
  return `claim_${randomBase64URL(CLAIM_TOKEN_BYTES)}`;
}

export function isPlausibleLegacyClaimToken(value: string): boolean {
  return /^claim_[A-Za-z0-9_-]{43}$/u.test(value);
}

export async function hashLegacyClaimToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
