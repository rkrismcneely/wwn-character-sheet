/**
 * Session Recap bring-your-own-provider catalog.
 *
 * This module describes connection methods and preferences only. No credentials,
 * provider calls, inference, OAuth grants or billing-enabled requests occur here.
 * Rates, limits and free-tier availability are never hardcoded as guarantees.
 */
export const recapProviderIds = ["groq", "gemini", "local-whisper", "manual"] as const;
export type RecapProviderId = (typeof recapProviderIds)[number];
export type RecapProviderTask = "transcription" | "recap";
export type RecapConnectionMethod = "api-key" | "on-device" | "none";

export type RecapProviderInfo = {
  id: RecapProviderId;
  name: string;
  connectionMethod: RecapConnectionMethod;
  transcription: boolean;
  recap: boolean;
  execution: "remote" | "on-device" | "manual";
  accountUrl: string | null;
  privacyNote: string;
  freeAccess: "limited-free-tier" | "device-compute" | "manual";
  needsSeparateConnection: boolean;
};

export const recapProviders: readonly RecapProviderInfo[] = [
  {
    id: "groq", name: "GroqCloud",
    connectionMethod: "api-key", transcription: true, recap: true,
    execution: "remote", accountUrl: "https://console.groq.com/keys",
    privacyNote: "Audio and text sent to Groq. Free usage is subject to organization limits.",
    freeAccess: "limited-free-tier", needsSeparateConnection: true,
  },
  {
    id: "gemini", name: "Google Gemini API",
    connectionMethod: "api-key", transcription: false, recap: true,
    execution: "remote", accountUrl: "https://aistudio.google.com/api-keys",
    privacyNote: "Recap text sent to Google. Unpaid-tier data-use terms differ from paid-tier terms.",
    freeAccess: "limited-free-tier", needsSeparateConnection: true,
  },
  {
    id: "local-whisper", name: "Local Whisper",
    connectionMethod: "on-device", transcription: true, recap: false,
    execution: "on-device", accountUrl: null,
    privacyNote: "Audio stays on the device; performance depends on device and browser.",
    freeAccess: "device-compute", needsSeparateConnection: false,
  },
  {
    id: "manual", name: "Manual recap",
    connectionMethod: "none", transcription: false, recap: true,
    execution: "manual", accountUrl: null,
    privacyNote: "No AI provider receives campaign content.",
    freeAccess: "manual", needsSeparateConnection: false,
  },
] as const;

export type RecapProviderPreferences = {
  transcription: RecapProviderId | null;
  recap: RecapProviderId;
  freeOnly: true;
  fallback: "pause";
};

function getProvider(value: unknown): RecapProviderInfo | null {
  return recapProviders.find(provider => provider.id === value) ?? null;
}
export function selectRecapProvider(task: RecapProviderTask, value: unknown): RecapProviderInfo {
  const found = getProvider(value);
  if (!found || !found[task]) throw new Error("Selected provider does not support this task.");
  return found;
}

/**
 * Validate preferences; never silently fall back to another user/provider,
 * especially one that may have billing enabled. The manual recap mode can be
 * selected without connecting any external service.
 */
export function parseRecapProviderPreferences(raw: unknown): RecapProviderPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Choose transcription and recap providers.");
  }
  const p = raw as Record<string, unknown>;
  if (p.freeOnly !== true || p.fallback !== "pause") {
    throw new Error("Only free-only operation and pause-on-limit are supported.");
  }
  if (p.transcription !== null) selectRecapProvider("transcription", p.transcription);
  selectRecapProvider("recap", p.recap);
  return {
    transcription: p.transcription as RecapProviderId | null,
    recap: p.recap as RecapProviderId,
    freeOnly: true,
    fallback: "pause",
  };
}

export function providerConnectionNeeded(prefs: RecapProviderPreferences): RecapProviderId[] {
  const set = new Set<RecapProviderId>();
  for (const id of [prefs.transcription,prefs.recap]) {
    if (id && getProvider(id)?.needsSeparateConnection) set.add(id);
  }
  return [...set];
}
