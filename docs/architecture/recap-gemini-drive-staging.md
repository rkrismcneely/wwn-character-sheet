# Gemini prepared audio in GM-owned Google Drive

## Purpose
Keep the Gemini background queue's **audio source** durable after the GM closes
their browser, without making the TWE site owner pay for storage, audio encoding,
or hosted inference.

## Preparation
1. In Session Recap, select Gemini and expand "Prepare your Craig session for
   future unattended Gemini processing".
2. Select an imported, confirmed Craig recording and choose your own
   Google Drive account. A Gemini connection must already exist in Account.
3. Save a private Gemini job. This does not start provider inference.
4. For each confirmed speaker track, provide a separate ordinary PCM RIFF WAV.
   The browser reads only 4 minutes of source data at once, mixes channels to
   mono 16 kHz/16-bit, and writes an independently playable WAV.
5. Each WAV clip is uploaded directly to **that GM's Google Drive** using the
   preexisting, owner-verified resumable Drive session. TWE never proxies the
   audio through the site owner's R2 storage. A private progress record
   associates every clip's index and session-relative boundaries to that job.
6. On interruption, reselect the **same** WAV. Previously linked chunks are
   SHA-256 compared and skipped. Source changes are not silently accepted.
7. When all confirmed Craig tracks are uploaded, explicitly seal the job.

## Security/cost
- Jobs are per campaign, recap, Craig import and initiating GM. Drive storage
  ownership and authorized OAuth grant are checked on file start and completion.
- Processing uploads are excluded from player-facing audio listings **and**
  the player streaming endpoint, including if a URL is guessed.
- The API verifies that the uploaded Drive file belongs to the correct
  processing job, GM and recap, has the expected MIME, size and duration,
  and isn't already attached to another chunk.
- Each clip's client-computed SHA is a resume identity, **not a server-side
  authenticated integrity proof** of the remote bytes. A future runner must
  re-read and hash the Drive bytes before submitting them to Gemini.
- The job remains non-executable in this phase; the background runner and the
  verification of per-project free quotas are still required.
- The converted clips add to the **GM's Drive quota**, not TWE's quota.
  Users can disconnect Drive; any queued jobs must then fail closed.

## Limitations and next steps
- The source must be an ordinary uncompressed WAV. FLAC and AAC Craig audio
  require real streaming decoding rather than splitting compressed bytes.
- The GM must leave the browser open while initially preparing/uploading audio.
  Only **after** the separate scheduled Gemini runner is delivered will
  transcription itself continue with the PC turned off.
- Building additional hundreds of Drive files can be tedious; offer
  batch cleanup once a transcript is successfully saved and reviewed.
- Next: delegated server-side Drive fetch for a verified clip; MIME and hash
  validation; limited/pauseable Cloudflare scheduled runner; timestamped Gemini
  fragment persistence, idempotent resume; automatic GM-only draft assembly.
- After end-to-end test with representative 2–3h Craig multitrack recordings,
  enable the unattended option and build the Account Summary Wizard that
  explains manual, mixed and fully automatic options.
