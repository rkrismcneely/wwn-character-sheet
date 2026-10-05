export const CLIENT_ERROR_REPORT_PATH = "/__twe/client-error";
export const OBSERVABILITY_EVENT_VERSION = 1;

export type ClientErrorKind =
  | "window-error"
  | "unhandled-rejection"
  | "react-boundary";

export type ClientErrorReport = {
  kind: ClientErrorKind;
  route: string;
  errorName: string;
  fingerprint?: string;
  source?: string;
  line?: number;
  column?: number;
};

const clientErrorKinds = new Set<ClientErrorKind>([
  "window-error",
  "unhandled-rejection",
  "react-boundary",
]);

const builtInErrorNames = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "DOMException",
]);

const safeRouteSegments = new Set([
  "",
  "__twe",
  "account",
  "api",
  "archive",
  "auth",
  "callback",
  "campaign-invites",
  "campaigns",
  "characters",
  "client-error",
  "encounters",
  "gm",
  "image",
  "items",
  "join",
  "live",
  "maps",
  "new",
  "npc",
  "portraits",
  "profile",
  "public-characters",
  "resources",
  "restore",
  "rolls",
  "session",
  "sign-in-providers",
  "stores",
  "tokens",
  "visibility",
  "_vinext",
]);

function cleanPathname(value: string): string {
  try {
    return new URL(value, "https://twe.invalid").pathname;
  } catch {
    return "/";
  }
}

export function sanitizeRoutePath(value: string): string {
  const pathname = cleanPathname(value);
  const segments = pathname.split("/").map((segment) => {
    if (safeRouteSegments.has(segment)) return segment;
    if (/^\d+$/u.test(segment)) return ":number";
    return ":id";
  });
  const normalized = segments.join("/") || "/";
  return normalized.slice(0, 256);
}

export function sanitizeErrorName(value: unknown): string {
  if (typeof value !== "string") return "Error";
  if (builtInErrorNames.has(value)) return value;
  if (/^[A-Z][A-Za-z0-9]{0,47}Error$/u.test(value)) return value;
  return "Error";
}

export function sanitizeSourcePath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const pathname = new URL(value, "https://twe.invalid").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const filename = parts.at(-1);
    if (!filename || !/\.(?:js|mjs|cjs)$/u.test(filename)) return undefined;
    const safeParts = parts.slice(-3).map((part) =>
      /^[A-Za-z0-9._-]{1,80}$/u.test(part) ? part : ":asset",
    );
    return `/${safeParts.join("/")}`.slice(0, 192);
  } catch {
    return undefined;
  }
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > 10_000_000) return undefined;
  return value;
}

export function normalizeClientErrorReport(value: unknown): ClientErrorReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!clientErrorKinds.has(input.kind as ClientErrorKind)) return null;
  if (typeof input.route !== "string") return null;

  const report: ClientErrorReport = {
    kind: input.kind as ClientErrorKind,
    route: sanitizeRoutePath(input.route),
    errorName: sanitizeErrorName(input.errorName),
  };

  if (typeof input.fingerprint === "string" && /^[a-f0-9]{32}$/u.test(input.fingerprint)) {
    report.fingerprint = input.fingerprint;
  }
  const source = sanitizeSourcePath(input.source);
  if (source) report.source = source;
  const line = positiveInteger(input.line);
  if (line) report.line = line;
  const column = positiveInteger(input.column);
  if (column) report.column = column;
  return report;
}

export function sanitizeRayId(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[A-Fa-f0-9]{8,32}(?:-[A-Za-z]{3})?$/u.test(value) ? value : undefined;
}

function fingerprintMaterial(error: unknown): string {
  if (!(error instanceof Error)) return `non-error:${typeof error}`;
  const stackFrames = (error.stack ?? "")
    .split("\n")
    .slice(1, 9)
    .map((line) => line.replace(/[A-Za-z0-9_-]{18,}/gu, ":id").trim())
    .join("\n");
  return `${sanitizeErrorName(error.name)}\n${stackFrames}`;
}

export async function createErrorFingerprint(error: unknown): Promise<string | undefined> {
  try {
    const encoded = new TextEncoder().encode(fingerprintMaterial(error));
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return undefined;
  }
}
