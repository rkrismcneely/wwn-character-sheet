# Unattended Gemini execution — guarded scheduled runner

## Added by this change
- Cloudflare Cron invokes `worker.scheduled()` every five minutes. It returns
  immediately without DB or provider calls when `RECAP_GEMINI_BACKGROUND_ENABLED`
  is unset (the default).
- One bounded task per invocation: **poll an existing interaction first**;
  otherwise lease at most one verified Drive WAV clip. The worker reads the
  prepared audio from the GM's own Google Drive (fully rechecks SHA-256 and
  WAV format), uses exclusively that GM's encrypted Gemini API key, and
  submits the clip to the dedicated Gemini Transcribe Interactions API.
- A returned interaction ID is stored in D1 with its next eligibility time.
  Later Cron events GET that ID rather than uploading or submitting the same
  audio again.
- Timestamped results are written as immutable private R2 transcript
  fragments; only then is the matching lease acknowledged. A completed job
  is marked `awaiting_review`, **not published to players**.
- Provider 429s back off; expired leases and ambiguous POST results are
  quarantined instead of automatically resubmitting paid requests. Deleting
  the GM's connected Gemini key prevents any new submissions.
- The cost ceiling for **explicitly GM-owned paid projects** reserves
  10,000 USD microcents per whole input minute (a conservative ~$0.01/min,
  not a quotation). Jobs cannot lease or submit if that reserve would
  exceed their own stated maximum. Reservations remain spent after an
  unknown/failed request rather than accidentally permitting reuse.

## Deliberately off for existing free-tier job plans
Google publishes an ongoing **free** Gemini 3.5 Transcribe tier, but it does
not provide a reliable account-independent endpoint that proves an arbitrary
GM project's exact free usage or billing status in advance. A single global
flag claiming all connected accounts are free could inadvertently charge
individual GMs. Therefore **freeQuotaVerified is always false in this
scheduled runner**. Existing free-only jobs remain safely staged, but
automatic transcription does not begin.

The runner's feature flag is also **unset by default**, including previews.
GM-paid job authorizations and their maximums are not yet exposed in the UI.
No one can turn on billable inference just by visiting the recap page.
Do not enable this Cron worker's provider submission in production before
credential/account verification and an end-to-end real-account test.

## Additional operational caveat
Cloudflare Workers Free has a **10 ms CPU budget** and 128 MiB memory per
invocation. Downloading, validating and hashing a ~7.7 MB WAV could exceed
that free CPU budget. We must measure real Cloudflare runtime execution and
potentially shorten clips, schedule lighter I/O, or use a GM-funded worker
before claiming full unattended throughput. This commit does not promise
that 225 segments finish within a particular number of days.

## Still needed
- Explicit Account-level authorization to use a non-billing Google project
  for background work (with a trustworthy quota check or fail-closed
  user-funded setting).
- GM dashboard progress, per-clip failures, consent withdrawal and
  reconciliation of interrupted provider requests.
- Assemble saved fragments into the private editable transcript, preserving
  established Craig speaker -> character associations.
- Real-world worker latency/CPU/quota validation on a representative multi-
  track three-hour recording, plus native FLAC/AAC media handling.
- Account Summary Wizard with manual/mixed/automated presets after this path
  truly works.

Sources:
https://ai.google.dev/gemini-api/docs/transcribe
https://ai.google.dev/api/interactions-api
https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
https://developers.cloudflare.com/workers/platform/limits/
