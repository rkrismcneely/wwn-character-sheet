# Session Recaps: Drive first, optional confirmed Gemini analysis

## Two-step GM workflow
1. A GM connects Google Drive, optionally saves a personal Gemini API key, and creates
   a private session recap with date and working title.
2. **Step 1: upload** a full mixed MP3/M4A/WAV/FLAC/AAC recording. Browser uploads the
   original directly into the GM's `Tales Without End` Drive folder. The completed
   recording is linked to the private recap and playable immediately. **This never
   starts Gemini or incurs AI usage**, even if older account-level automation settings
   were enabled. Audio can remain attached without ever generating a summary.
3. **Step 2: Auto Summarize.** The GM chooses a saved recording, opens a confirmation
   dialog, and individually approves sharing the recording and contextual Journal/
   prior recaps and any possible personal Gemini quota usage or billing.
4. An authenticated GM-only API verifies that file is ready in the GM's own Drive,
   checks the personal encrypted Gemini connection and private recap, records a
   per-job `confirmed_at` timestamp, and inserts at most one job per audio asset.
   No inference occurs in the confirmation API response itself.
5. The existing scheduled Worker processes **only** jobs with `confirmed_at IS NOT NULL`.
   Previous account-wide automatic jobs without this timestamp cannot initiate new work.
   It streams the Drive recording to a temporary Gemini Files upload, then submits a
   `gemini-3.8-flash` background Interactions request and polls the saved interaction ID.
   The original never passes through site-owned R2 and remains in the GM's Drive.
6. A completed Markdown recap is saved privately. The AI result cannot auto-publish
   or replace GM-edited text. The GM reviews it, edits, and explicitly publishes.
   The existing authorized audio player persists in the published recap.

## Security and charges
- Files API per-file limit: 2 GB; Gemini documentation permits 9.5 hours of audio
  per prompt, but practical three-hour recordings are still unverified end to end.
- Each job records exact GM approval; the key is only decrypted for a confirmed
  job and belongs to that GM. Site owner never pays for provider AI calls.
- A duplicate button POST cannot enqueue a second job for the same recording.
  An ambiguous billable Gemini POST is marked `needs_attention` rather than
  automatically repeated.
- The GM confirms data use (free tier may use content to improve products) and
  possible provider charges in a per-recording modal.
- Original Drive media can be played before or after summarization. Initial
  browser-to-Drive upload requires the browser to remain open; scheduled Gemini
  processing is independent of the browser.
- Old auto-created jobs remain in the database but are excluded from the scheduler
  unless explicitly confirmed under the new workflow. They are not bulk-deleted.

## Known integration validation limits
- Real Gemini audio inference and multi-hour Drive-to-Files stream need an actual
  connected GM account and sample. Automated tests can prove consent, schema,
  route authorization, state transitions and builds but not external provider
  latency or recap factual accuracy.
- The Cron invocation has a finite Cloudflare wall-clock budget. A very large
  file transfer may fail safely and require engineering work to resume its transfer;
  never claim that all 2–3-hour recordings are proven until real QA passes.
- Google Files expire after 48 hours. Background result retention may depend
  on Gemini account tier; TWE polls results and saves private output.
- No transcription or separate Craig tracks are needed. Full transcript tools
  remain optional and unchanged.

## Deployment
The additive `0049_recap_explicit_confirmation.sql` adds nullable
`confirmed_at`, intentionally leaving old jobs unapproved. The recap migration
workflow verifies it before deploying the updated Worker. No automatic recurrence
or cloud billing is configured for the site owner.
