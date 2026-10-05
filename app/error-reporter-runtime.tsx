"use client";

import { useEffect } from "react";
import {
  CLIENT_ERROR_REPORT_PATH,
  createErrorFingerprint,
  normalizeClientErrorReport,
  sanitizeErrorName,
  sanitizeSourcePath,
  type ClientErrorKind,
} from "@/lib/observability";

const MAX_REPORTS_PER_PAGE = 5;
const sentFingerprints = new Set<string>();
let sentReportCount = 0;

type ClientErrorMetadata = {
  source?: string;
  line?: number;
  column?: number;
};

function sameOriginSource(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return undefined;
    return sanitizeSourcePath(url.pathname);
  } catch {
    return undefined;
  }
}

async function sendClientError(
  kind: ClientErrorKind,
  error: unknown,
  metadata: ClientErrorMetadata = {},
): Promise<void> {
  if (sentReportCount >= MAX_REPORTS_PER_PAGE) return;

  const fingerprint = await createErrorFingerprint(error);
  const source = sameOriginSource(metadata.source);
  const dedupeKey = fingerprint ?? `${kind}:${source ?? "unknown"}:${metadata.line ?? 0}:${metadata.column ?? 0}`;
  if (sentFingerprints.has(dedupeKey)) return;

  const report = normalizeClientErrorReport({
    kind,
    route: window.location.pathname,
    errorName: sanitizeErrorName(error instanceof Error ? error.name : undefined),
    fingerprint,
    source,
    line: metadata.line,
    column: metadata.column,
  });
  if (!report) return;

  sentFingerprints.add(dedupeKey);
  sentReportCount += 1;

  void fetch(CLIENT_ERROR_REPORT_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

export function reportClientError(
  kind: ClientErrorKind,
  error: unknown,
  metadata?: ClientErrorMetadata,
): void {
  if (typeof window === "undefined") return;
  void sendClientError(kind, error, metadata);
}

export function ErrorReporterRuntime() {
  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      reportClientError("window-error", event.error, {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError("unhandled-rejection", event.reason);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
