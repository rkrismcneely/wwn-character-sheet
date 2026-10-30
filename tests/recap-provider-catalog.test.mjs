import assert from "node:assert/strict";
import test from "node:test";
import {
  recapProviders, selectRecapProvider, parseRecapProviderPreferences, providerConnectionNeeded,
} from "../lib/campaigns/recap-provider-catalog.ts";

test("each GM may choose separate transcription and narrative providers", () => {
  const prefs = parseRecapProviderPreferences({
    transcription: "groq", recap: "gemini", freeOnly: true, fallback: "pause",
  });
  assert.deepEqual(providerConnectionNeeded(prefs), ["groq", "gemini"]);
  assert.equal(selectRecapProvider("transcription", prefs.transcription).name, "GroqCloud");
  assert.equal(selectRecapProvider("recap", prefs.recap).name, "Google Gemini API");
});
test("on-device transcription and manual summaries require no linked accounts", () => {
  const prefs = parseRecapProviderPreferences({
    transcription: "local-whisper", recap: "manual", freeOnly: true, fallback: "pause",
  });
  assert.deepEqual(providerConnectionNeeded(prefs), []);
  assert.equal(selectRecapProvider("transcription", "local-whisper").execution, "on-device");
});
test("never silently permit paid mode, fallback or unsupported provider capabilities", () => {
  const base = { transcription: "groq", recap: "gemini", freeOnly: true, fallback: "pause" };
  assert.throws(() => parseRecapProviderPreferences({ ...base, freeOnly: false }), /free-only/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, fallback: "paid" }), /pause-on-limit/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, transcription: "gemini" }), /does not support/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, recap: "local-whisper" }), /does not support/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, transcription: "other" }), /does not support/);
});
test("provider catalog never includes secrets, shared keys, or provider invocations", () => {
  assert.deepEqual(recapProviders.map(p => p.id), ["groq", "gemini", "local-whisper", "manual"]);
  assert.ok(recapProviders.every(p => p.freeAccess && p.privacyNote && !("apiKey" in p)));
});
