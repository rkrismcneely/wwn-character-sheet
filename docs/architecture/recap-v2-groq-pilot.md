# Recap V2 — controlled Groq Whisper pilot (Phase 1)

Tracked by [issue #648](https://github.com/rkrismcneely/wwn-character-sheet/issues/648).

## Boundaries

This is NOT the default recap pipeline. No active TWE recording, Gemini recap,
published Journal entry, or existing full transcript is modified by the pilot.

The pilot is **off unless both** the Worker secret/variable
`TWE_RECAP_V2_PILOT_ENABLED=true` and the Next.js build-time flag
`NEXT_PUBLIC_TWE_RECAP_V2_PILOT_ENABLED=true` are deliberately enabled.
Do not enable the flag for other GMs before the owner verifies source security,
real Groq URL ingestion, and private transcript storage.

* Readiness GET: authenticated GM only, verifies the GM owns an existing M4A
  in Google Drive and has their own Groq key connected. The GM browser then plans a short,
  independently decodable first excerpt with at most 16 MiB of audio bytes,
  using the existing authorized Range route. CPU-heavy AAC inspection stays in
  the browser, not the Cloudflare Free Worker. No AI inference occurs.
* Start POST: explicit separate consent to share exactly that short audio
  excerpt with Groq and consume the GM's own provider quota. One attempt is
  durably inserted before any provider POST. A repeat is rejected, even on a
  provider timeout or uncertain result.
* Temporary URL: 10-minute HMAC-bound, scoped to campaign, recap, asset and
  storage-owner account. Fetch is no-cookie, no OAuth token exposure, no open
  Drive share. The URL is a bearer capability; never paste, log or publish it.
* Retrieval: Groq receives only a standalone M4A reconstructed from original
  AAC packet bytes via authenticated Drive byte ranges. Source GET and HEAD
  support a single valid HTTP range. The clip is limited to 2 minutes and
  16 MiB. The original in Drive is not altered or reuploaded.
* Provider: connected GM-owned `whisper-large-v3` returns `verbose_json`
  with segment timestamps. Validated transcript is saved privately to R2 in
  `recap-v2-pilot/...`; no recap is auto-published or rewritten. The pilot
  status is permanently checkpointed in D1.

## Reality checks before enabling

1. Review the signed URL endpoint for info leaks, browser caching, redirect
   behavior, HEAD/Range fetching, SSRF and unexpected public hostnames.
2. Use a local/generated sample with valid AAC, then **one explicitly
   GM-approved 2-minute excerpt** from a real already-stored Drive recording.
3. Verify Groq's URL-media fetch can actually read the signed TWE host within
   10 minutes and returns timestamped segments.
4. Inspect the resulting private transcript, especially original fantasy
   names; no speaker identity should be inferred from mixed-down audio.
5. Test provider 429, 5xx, malformed response and disconnected Drive/Groq
   keys, while verifying no automatic duplicate inference.
6. Confirm actual free-tier limits for the GM's Groq organization.

This DOES NOT prove 90-minute or 3-hour processing. Groq documents a 25 MB
free-tier maximum file size; accepting a media URL is NOT evidence that a
long recording of arbitrary size will succeed. Longer sessions will require
a tested bounded-chunk source and durable time-aware scheduling.

## Rollout order

- Phase 1: disabled-by-default, small URL-media pilot (this PR)
- Phase 2: real short sample, GM-reviewed result and security/compatibility
- Phase 3: Drive-owned durable 2–3-hour transcription chunks, hourly pacing,
  deduplication, continuity/timestamp verification
- Phase 4: Groq text-only event extraction and high-detail recap writer,
  with pre-validated names and end-of-session coverage
- Phase 5: opt-in GM rollout; measure completion/reliability before retiring
  Gemini audio analysis

No site-owner paid processing; individual GMs may use their own free or paid
providers after approving sharing and any costs.

Sources: https://console.groq.com/docs/speech-to-text and
https://console.groq.com/docs/rate-limits
