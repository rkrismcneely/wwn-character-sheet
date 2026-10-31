# Recap Only: GM-owned background audio summarization

## Flow
1. GM connects Google Drive through explicit Drive OAuth and saves a personal Gemini key.
2. GM chooses brief/standard/detailed and explicitly approves future automatic audio+campaign
   context sharing and any billing from **their own Gemini project**. Opt-out stops future
   provider activity without deleting past recording data.
3. GM creates a private draft and uploads their original compressed or WAV recording to
   their own `Tales Without End` folder in Google Drive, using resumable browser upload.
4. Once Drive verifies the file, TWE creates **at most one job per recording** if automatic
   consent is active. No action on Gemini occurs by merely creating a draft.
5. A 5-minute Cloudflare Cron moves the file as a **stream** from GM Drive into Gemini Files
   (up to Gemini's 2 GB per-file limit). No transcripts, per-speaker tracks, intermediate WAV
   clips, site-owned R2 audio, or large in-Worker buffers.
6. Later Cron ticks verify the file is ACTIVE, submit Gemini's **background Interactions**
   request (model `gemini-3.6-flash`) with chronological audio and bounded Journal/previous
   recap context, then poll a saved interaction ID.
7. A completed Markdown result is saved privately in D1 and added to the private recap
   when its content is still the original empty-draft placeholder. GM edits win.
8. The GM reviews/corrects the draft, explicitly publishes, and the existing authorized
   embedded audio player shows their original Drive audio with chapter links based on
   timestamped Markdown headings.

## Free owner / consent protections
- All Gemini calls use only the requesting GM's encrypted own key after verifying
  `user_recap_auto_preferences` still grants automatic processing and billing approval.
- The site never uses a common AI credential and never attempts to query quotas it cannot
  reliably verify. A GM's provider can charge their project depending on their tier.
- Google's free-tier API inputs may be used to improve products; the Account setup states this.
- Jobs use a UNIQUE audio asset and conditional state transitions to avoid duplicate
  inference. Ambiguous model POST outcomes are marked `needs_attention` and never
  automatically resubmitted.
- Only a GM can read processing details, and results remain unpublished until explicitly
  approved. Uploaded audio is restricted by existing campaign/audio authorization.

## Operational limitations and QA gates
- Gemini Files API has a 2 GB file maximum, stores temporary media for 48 hours, and
  free-tier background interactions may be retained for only one day. Every 5-minute
  scheduled tick checks one job and prioritizes result polling.
- Multi-hour **Drive-to-Gemini streaming remains unverified on a real recording**.
  Confirm Worker CPU/wall limits, streaming behavior, file MIME support, transient
  network error recovery, and Gemini's 3-hour audio context before advertising reliable
  unattended handling. Large file transfers could exceed a single scheduled invocation.
- A transient or expired Gemini file can leave the job `needs_attention` while its
  Google Drive original remains safe. A failed or ambiguous provider POST must not be
  automatically retried because of possible duplicated charges.
- Switching off the saved preference stops future stages; a previously submitted Gemini
  task may still finish or incur charges. GM should revoke/cancel with provider when needed.
- A GM with a file over 2 GB gets a visible processing warning, but the file is still
  stored/playable in Drive. Compression or chunked native-audio analysis can be added later.
- The upload browser must remain open for the initial upload to Drive. After verification,
  the scheduled job can proceed without the browser.
- TWE's audio playback depends on reconnecting the file owner's Drive account after
  revocation; files are never deleted on disconnect.
- Cloudflare secret `RECAP_STORAGE_ENCRYPTION_KEY` and authorized Drive OAuth callback
  must already be configured, as documented in
  `docs/operations/recap-google-drive-oauth.md`.

## Production deployment
`drizzle/0048_recap_only_automation.sql` is applied and verified by the
`Migrate and Deploy Session Recaps` workflow before the updated Worker deploys.
The additional Cron uses the already configured 5-minute schedule.
No automatic recording creation is attempted without a verified Drive file and
account-level consent. The prior transcript pipeline is left intact and optional.
