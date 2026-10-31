# Unattended Gemini transcription — durable queue, staged rollout

This change introduces **persistence and admission controls**, not unattended inference.
Do not label Gemini's recap option "runs while your PC is off" until staged media,
cron scheduling, and a tested provider adapter are connected.

## Owner cost boundary
- Every job belongs to the TWE user who connected the Gemini key. Other GMs in
  the same campaign can inspect permitted recap content, not spend that key.
- At most two nonterminal jobs per GM and 16 confirmed Craig tracks per job.
- A job starts in `awaiting_source`; creating it never triggers an AI request.
- New jobs must have an explicit privacy and possible-usage consent, a verified
  connected-user key entry, an existing recap and a confirmed Craig speaker snapshot.
- `provider-free-only` must fail closed until the user's actual provider quota
  and data-use settings can be verified. There is no site-owned paid fallback.
- Paid-GM jobs require an explicit nonzero per-job maximum and a verified cost
  before dispatch. Merely choosing "GM paid allowed" is never enough.
- The free Cloudflare Worker runtime has a 10ms CPU budget per request; audio
  decoding/transcoding must be done outside Cron invocations.
- Neither an AI key nor Craig source reference may be returned in job-status APIs.

## Lifecycle
1. `awaiting_source`: Confirmed audio source exists, but the independent playable
   clips have not yet been encoded or uploaded. Source offsets are required.
2. `queued`: Each chunk has a verified MIME type, bytes, digest and durable source
   locator. No raw byte-range cuts of compressed audio.
3. `leased` chunk: One authenticated GM-owned job controls the chunk for up to
   5 minutes. The callback performs only bounded I/O, no audio transcoding.
4. `completed` chunk: Persist a private fragment with validated word timestamps
   and exact speaker mapping; acknowledge only with matching lease token.
5. `awaiting_review`: Assemble all fragments into private recap transcript.
   The GM reviews it before any player sees it.
6. 429/503: pause for at least 24 hours without changing provider or account.
   A connection revocation or unknown billable result pauses for GM review.

An expired lease is quarantined as **unknown result**; never blindly retry a
potentially billed provider call. Explicit GM review must reconcile uncertain
work before it can be submitted again.

## Next integration before enabling unattended processing
- GM-owned Drive audio upload and delegated read for each prepared chunk.
- Real FLAC/AAC decoding / independent clip encoding in the browser or a
  non-owner-paid processor. Match the Craig per-track timeline offsets.
- Durable fragment results, acknowledgement and assembly. The job table already
  supports per-chunk receipts and lease state.
- Cron trigger with a small per-invocation budget, feature flag,
  safe provider token decryption and post-run cleanup.
- Measured user/project quota, cost ceiling and no inference on owner credentials.
- End-to-end test using 2–3h multitrack Craig, account disconnect/reconnect,
  power-off resume, 429 and a provider timeout.

## Summary Wizard
Build after the unattended path has a real completion state:
**Account > Summary Wizard**, invoked first time and re-openable later.
Walk through manual, assisted and automated workflows, then ask for recording
source (Craig/direct audio), speaker confirmation, transcription (Groq,
Gemini, Local Whisper, imported Craig captions), recap writer, owner-owned
audio storage and playback privacy. Every choice should explain actual limits
and costs. Store individual preferences separately so users may edit them
without rerunning the entire wizard.

Docs: https://ai.google.dev/gemini-api/docs/transcribe,
https://developers.cloudflare.com/workers/configuration/cron-triggers/,
https://developers.cloudflare.com/workers/platform/limits/
