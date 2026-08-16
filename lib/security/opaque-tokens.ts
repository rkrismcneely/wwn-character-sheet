export function randomBase64URL(byteLength: number): string {
  if (!Number.isInteger(byteLength) || byteLength < 1) {
    throw new RangeError("byteLength must be a positive integer");
  }

  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export async function hashOpaqueToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0"),
  ).join("");
}
