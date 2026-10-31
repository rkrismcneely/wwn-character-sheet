# Session Recaps: recording-first, recap-only rollout

## Shipped in this phase
- **Recap Only is the default**. A GM may create a private, unpublished recap draft with just a
  session date and working title. No fabricated summary, speaker mapping or transcript is required.
- Recordings (MP3, M4A, WAV, FLAC, AAC) attach directly to the GM's own Google Drive after the
  private draft exists. Existing multi-hour resumable Drive uploads and private playback are reused.
- The GM sees drafts in their list. Player-facing archives, direct recap lookup and audio
  authorization reject unpublished drafts. Publishing requires a nonempty GM-reviewed Markdown
  recap. Existing recaps are published by the additive migration.
- Craig multitrack import, transcription, and the transcript-driven Groq writer remain available
  under **Advanced**. They are optional and have not been discarded.
- Three legacy site-owned R2 paths (raw upload, Craig ZIP transfer, extracted track) perform a
  conservative, fail-closed **6 GiB shared recap-audio intake check** before adding files.
  Replacement files account for their existing size. No automatic destructive deletion.
- Account information now states that connecting Gemini starts no inference and clarifies
  free-tier data-use differences. No unattended Gemini jobs are enabled.

## Not yet implemented
**Direct AI audio summarization** is the next processing phase, not a feature of this change.
Do not imply a recording upload generates a recap or incurs AI usage. The old free-only Gemini
transcription queue remains disabled. A recording-only GM draft remains private until the GM
reviews an actual summary and explicitly publishes it.

The recap-only provider adapter should:
1. Reuse the verified Drive audio asset and encrypted GM Gemini connection; never expose keys
   to the browser, never silently switch projects or charge the TWE site owner.
2. Use native audio understanding via a compatible Gemini Files API upload and a response
   containing ordered events and approximate timestamps, followed by a recap synthesis stage.
   No transcript or isolated speaker tracks are prerequisites. Avoid server-side audio decode.
3. Explicitly confirm GM choice, privacy and possible billing with a per-job limit/eligibility
   strategy. Free-only provider billing status is not verifiable from an API key alone.
4. Use a provider interaction ID for resumption, verify model/file limitations, poll with bounded
   Cloudflare CPU and invocation limits, and persist the result *privately* for GM approval.
5. Test with real 2–3-hour mixed recordings and multitrack Craig samples before claiming
   full-recording accuracy or reliable unattended processing.

## R2 budget and retention limitations
The 6 GiB cap applies only to **new legacy recap-audio intake in three R2 prefixes**. It is
not a Cloudflare account-wide billing guarantee: other R2 data, independent concurrent writes,
retained old objects, monthly operation volume, and requests outside these legacy routes
are not covered. The ordinary Drive recording path does not create these R2 audio objects.

Production owner must verify that the R2 account stays on a no-billing configuration where
possible, inspect R2 usage regularly, and configure lifecycle rules for **verified temporary**
objects using [Cloudflare's prefix lifecycle controls](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
**Do not bulk-expire** `recap-craig/`, `recap-tracks/`, `recap-audio/`,
`recap-transcript-chunks/` or `recap-gemini-assembled/` indiscriminately: some are still
the only retained copy or pending GM-review draft. First establish object-level retention,
source transfer to the GM's storage, verified completion, and a recoverable cleanup workflow.
Cloudflare's free R2 allocation is account-wide and existing billing policies must be checked
in the dashboard. This repo does not have account-configuration access to change those settings.

## Migration and deployment
The additive `0047_recap_private_drafts.sql` uses `is_published DEFAULT 1`, keeping past
recaps visible. `scripts/migrate-recap-private-drafts.mjs` verifies the live D1 migration.
The recap migration-and-deploy workflow applies that migration before its own production
Worker deployment. Cloudflare's separately configured automatic build may run concurrently;
verify the production migration has applied before considering the new UI live.

## Audit-derived decisions intentionally deferred
- Avoid moving to a paid Cloudflare container or building custom diarization.
- Avoid automatically deleting recorded or in-progress audio.
- Avoid re-encoding the original compressed recording as hundreds of temporary PCM WAVs
  for a recap-only workflow. Reuse Gemini's native supported audio formats where tested.
- Keep the full-transcript pipeline stable and opt-in until real-session QA demonstrates value.
