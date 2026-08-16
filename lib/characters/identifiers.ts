import { hashOpaqueToken, randomBase64URL } from "../security/opaque-tokens.ts";

const PUBLIC_ID_BYTES = 16;
const CLAIM_TOKEN_BYTES = 32;

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

export function hashLegacyClaimToken(token: string): Promise<string> {
  return hashOpaqueToken(token);
}
