# Session Recap: zero-cost site operation with GM-selected Craig plans

**Hard requirement: no site-owner-funded subscriptions, paid infrastructure or usage-based bills.** Individual GMs may choose Craig supporter features or other paid provider tiers at their own expense. This supersedes the site-paid Container proposal. Full multi-hour transcription is not yet implemented.

## Confirmed from Craig's actual free download page

| Craig option | Free? | Practical value for TWE |
|---|---|---|
| Separate synchronized FLAC tracks (ZIP) | Yes | Highest archival quality and speaker attribution, but large |
| Separate AAC tracks (ZIP) | Yes | Smaller, practical default for long recordings |
| Audacity project / Adobe Audition session | Yes | Timelines and source track alignment; Audacity can be opened in free software |
| Browser-produced mixed FLAC / WAV / AAC | Yes, where supported | One track is cheapest to transcribe by AI minutes, but loses intrinsic speaker labeling and may be memory-heavy for 2–3 h sessions |
| Other formats: Opus, Vorbis, HE-AAC, Ogg FLAC, ADPCM/8-bit WAV | Yes (in Show all formats) | Import alternatives only when decoding is proven |
| raw.dat and info.txt | Yes; included in normal multitrack ZIP | Raw source metadata, timestamps and note events; info.txt is also directly downloadable |
| /note commands | Yes | Timestamped human gameplay highlights without AI |
| /webapp on | Yes | Higher-quality separate microphone tracks via browser, with VAD |
| Craig server transcriptions: VTT, SRT, TXT | **Craig Tier 3 (GM-paid)** | First-class direct transcript import for subscribed GMs. Prefer timestamped VTT/SRT; bypass TWE speech-to-text entirely |
| Craig automatic upload to personal cloud storage | **Craig supporter feature (GM-paid)** | Optional GM-owned storage ingestion integration later; not required for free use |
| Craig Smart Mix on servers | **Craig supporter feature (GM-paid)** | Accept the prepared audio when available; preserve free alternatives |

Sources: https://craig.chat/ , https://craig.chat/commands/ , https://craig.chat/docs/webapp/ , https://craig.chat/primer/ , https://craig.chat/get-started/ ; CraigChat/craig source files apps/ferret/src/lib/recording/sections.ts and apps/ferret/src/routes/rec/[id=recording]/DownloadModal.svelte.

## Cloudflare free allocations for site-owner infrastructure (October 2026)

- Workers AI: **10,000 neurons/day total per account**. @cf/openai/whisper-large-v3-turbo currently costs **46.63 neurons/min** and @cf/openai/whisper **41.14 neurons/min**. The theoretical maximum is ~214 or ~243 minutes/day respectively, *before any other model usage*. No paid overage is permitted.
- Workers Free: 100,000 requests/day, only 10 ms CPU per invocation (not enough for server-side FFmpeg or heavy compression).
- R2 Standard free: 10 GB-month storage, 1 million Class A and 10 million Class B requests/month. Quotas are account-wide, not a promise of unlimited audio storage.
- D1 Free: 5 GB total storage, 5 million rows read/day and 100,000 rows written/day.
- Queues Free: 10,000 operations/day and 24-hour message retention. D1 keeps durable jobs for multi-day continuation.
- Workflows Free: daily step quota; orchestration must batch work. Do not use one Workflow step per 30-second chunk.
- Cloudflare Containers require a paid account; **do not enable**. Craig's tiered paid transcription and auto-upload are allowed when the individual GM pays Craig directly.

Source: https://developers.cloudflare.com/workers-ai/platform/pricing/ , https://developers.cloudflare.com/workers/platform/pricing/ .

## Recommended owner-free, GM-flexible strategy

1. Prioritize **Craig source link, speaker metadata and info.txt notes**. The TWE GM should not be required to subscribe to Craig.
2. Prefer **AAC multitrack export** to reduce transfer/storage while retaining speaker tracks; offer FLAC when needed.
3. Prepare **two possible transcription paths** without promising a 3-hour single-pass Whisper call:
   - **Mixed audio path**, potentially fits one daily free AI allocation, but loses per-speaker labels. Useful when dialogue attribution is optional.
   - **Craig separate tracks path**, preserves speakers, but may take multiple days on the daily free AI allocation, especially 6 × 3 hours. Speech-only segmentation could lower demand but must be measured, not assumed.
4. Use browser-based/native audio conversion *only where tested* (the current PCM WAV planner cannot decode FLAC or AAC). An optional locally run open-source FFmpeg or Whisper pipeline may be needed for offline zero-cloud-AI use; it is NOT an installed or operational service in TWE.
5. Persist work in D1/R2 with resumable jobs, avoid loading entire session audio in a Worker. Let TWE platform free quotas pause jobs instead of upgrading the site owner's infrastructure; individual GM-owned provider paid tiers can be used with consent.
6. Implement a **hard account-wide free quota gate** verified against Cloudflare's usage before enabling automatic inference. The legacy short-track prototype now fails closed unless a not-yet-configured server-side free-quota verification setting is explicitly enabled. The UI button is disabled. No inference is permitted under the new default. A robust daily free-neuron reservation/check still needs implementation; do not enable this flag before that work and a verified zero-billing account plan.
7. Improve source-data imports: accept existing SRT/VTT/other text provided by GMs and display Craig /note events, independent of AI. Plain text is not a substitute for timestamps unless available.
8. Respect 7-day Craig expiry and user privacy, create an audio-retention policy with size quotas, and provide no-cost manual recap/journal editing throughout.


## Optional GM-paid services

Craig Tier 3 currently supplies VTT, SRT and TXT transcription downloads to supporter accounts. If a GM has that plan, TWE should ingest the resulting transcript directly, align speakers where possible, and skip cloud transcription. Subscription setup and payment happen entirely on Craig/Patreon, never through TWE. Free Craig users retain the separate AAC/FLAC and local transcription paths. Any paid Groq/Gemini API usage is tied to each GM's own credential and their explicit per-job selection; it never uses a TWE account.

## Major no-cost opportunity: Craig already has a browser media processor

Craig's current free **Minizel** implementation handles the raw recording stream (`/raw.dat`) in the user's browser. It supports synchronized separate-track exports and a mixed output, decodes raw Opus/FLAC source packets using browser/WASM audio decoders, uses MediaBunny for AAC/FLAC/WAV output, and has bounded queues and resilient network download/resume handling. This is closer to our needs than running server-side FFmpeg in a CPU-limited free Worker.

Verified in CraigChat/craig:
- apps/ferret/src/routes/rec/[id=recording]/MinizelModal.svelte
- apps/ferret/src/lib/minizel/index.ts
- apps/ferret/src/lib/minizel/processor.ts
- apps/ferret/src/lib/minizel/resilientFetch.ts
- apps/ferret/src/lib/recording/sections.ts

Craig's repository uses the **ISC license** (retain copyright notices if reusing code); independently review third-party dependency licences.

**Preferred next experiment (not yet implemented):** prototype TWE browser-local, bounded streaming media preparation using this open-source approach, creating independently playable chunks and uploading only the chunks free quotas permit. Do not copy Craig's processor blindly: it currently targets locally created files and browser-specific File System Access APIs. Verify iOS Safari, Mac Safari, and Chrome/Edge support, memory, formats, CORS, and privacy before integration. Unsupported browsers need an optional free desktop export path.

This can allow user-selected source tracks and speech windows where supported, rather than blindly transcribe all 3 hours of all 6 tracks.

## Unresolved technical proof points

- Confirm the actual shape of Craig's info.txt content with a real recording before automatically parsing notes (current UI displays raw text).
- Confirm real multitrack AAC ZIP extension/mime variants and timing behavior. Newly added AAC extraction has not been tested against a real export.
- Validate free plan R2 transfer >90 MB: current endpoint still limits Craig archives to 90 MB; resumable multipart or browser-local processing is required.
- Confirm browser/device CPU/memory before attempting 3-hour on-device decoding.
- Test whether Workers AI accepts long AAC/FLAC directly and whether timing output is correct; never assume arbitrary byte cuts are valid chunks.
- Verify the site's own Cloudflare plan and live Workers AI neuron usage. No site-owner-paid fallback.
