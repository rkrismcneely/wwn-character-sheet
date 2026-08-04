export const CANONICAL_ORIGIN = "https://taleswithoutend.com";
export const FALLBACK_WORKER_HOST =
  "wwn-character-sheet.rkrismcneely.workers.dev";

export function canonicalAuthURL(pathname: string): URL {
  return new URL(pathname, CANONICAL_ORIGIN);
}
