import { randomBase64URL } from "../security/opaque-tokens.ts";

const PUBLIC_ID_BYTES = 16;

export function generatePublicCharacterId(): string {
  return `chr_${randomBase64URL(PUBLIC_ID_BYTES)}`;
}

export function isPlausiblePublicCharacterId(value: string): boolean {
  return /^chr_[A-Za-z0-9_-]{22}$/u.test(value);
}

