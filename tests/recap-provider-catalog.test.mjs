import assert from "node:assert/strict";
import test from "node:test";
import {
  recapProviders, selectRecapProvider, parseRecapProviderPreferences, providerConnectionNeeded,
} from "../lib/campaigns/recap-provider-catalog.ts";

test("each GM may choose separate transcription and narrative providers", () => {
  const prefs = parseRecapProviderPreferences({
    transcription: "groq", recap: "gemini", billingMode: "provider-free-only", fallback: "pause",
  });
  assert.deepEqual(providerConnectionNeeded(prefs), ["groq", "gemini"]);
  assert.equal(selectRecapProvider("transcription", prefs.transcription).name, "GroqCloud");
  assert.equal(selectRecapProvider("recap", prefs.recap).name, "Google Gemini API");
});
test("on-device transcription and manual summaries require no linked accounts", () => {
  const prefs = parseRecapProviderPreferences({
    transcription: "local-whisper", recap: "manual", billingMode: "provider-free-only", fallback: "pause",
  });
  assert.deepEqual(providerConnectionNeeded(prefs), []);
  assert.equal(selectRecapProvider("transcription", "local-whisper").execution, "on-device");
});
test("GM can expressly allow their own paid provider plan, without automatic fallback", () => {
  const base = { transcription: "groq", recap: "gemini", billingMode: "provider-free-only", fallback: "pause" };
  const paid = parseRecapProviderPreferences({ ...base, billingMode: "gm-owned-paid-allowed" });
  assert.equal(paid.billingMode, "gm-owned-paid-allowed");
  assert.throws(() => parseRecapProviderPreferences({ ...base, billingMode: "site-owner-paid" }), /GM-owned/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, fallback: "paid" }), /fallback/);
  assert.equal(selectRecapProvider("transcription", "gemini").id, "gemini");
  assert.throws(() => parseRecapProviderPreferences({ ...base, recap: "local-whisper" }), /does not support/);
  assert.throws(() => parseRecapProviderPreferences({ ...base, transcription: "other" }), /does not support/);
});
test("provider catalog never includes secrets, shared keys, or provider invocations", () => {
  assert.deepEqual(recapProviders.map(p => p.id), ["groq", "gemini", "craig-transcript", "local-whisper", "manual"]);
  assert.ok(recapProviders.every(p => p.availability && p.privacyNote && !("apiKey" in p)));
});

test("Craig Tier 3 transcripts are a user-funded caption import, not a TWE subscription or API key", () => {
  const prefs = parseRecapProviderPreferences({
    transcription: "craig-transcript", recap: "gemini",
    billingMode: "gm-owned-paid-allowed", fallback: "pause",
  });
  assert.equal(selectRecapProvider("transcription", prefs.transcription).execution, "import");
  assert.equal(selectRecapProvider("transcription", prefs.transcription).availability, "subscriber-feature");
  assert.deepEqual(providerConnectionNeeded(prefs), ["gemini"]);
  assert.throws(() => selectRecapProvider("recap", "craig-transcript"), /does not support/);
});
