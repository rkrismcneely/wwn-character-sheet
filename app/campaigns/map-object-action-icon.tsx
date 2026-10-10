"use client";

/** Compact, accessible icons for actions shared by map-object toolbars. */
export function MapObjectActionIcon({ kind }: { kind: "duplicate" | "delete" }) {
  if (kind === "duplicate") {
    return <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
    </svg>;
  }
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m8 8 8 8m0-8-8 8" />
  </svg>;
}
