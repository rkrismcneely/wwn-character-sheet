# Session Recap: $0-only Craig workflow

**Hard requirement: no new paid subscriptions, infrastructure, paid transcription or usage-based charges.** This supersedes the paid-Container proposal in the earlier multi-hour architecture. This document separates available free exports from future work. Do not imply full multi-hour transcription is already implemented.

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
| Craig server transcriptions: VTT, SRT, TXT | **No; Tier 3** | Accept *user-supplied* transcripts when they already have them, but do not assume Craig produces them free |
| Craig automatic upload to personal cloud storage | **No; supporter feature** | Do not depend on it |
| Craig Smart Mix on servers | **No; supporter feature** | Do not depend on it |

Sources: https://craig.chat/ , https://craig.chat/commands/ , https://craig.chat/docs/webapp/ , https://craig.chat/primer/ , https://craig.chat/get-started/ ; CraigChat/craig source files apps/ferret/src/lib/recording/sections.ts and apps/ferret/src/routes/rec/[id=recording]/DownloadModal.svelte.

## Confirmed $0 Cloudflare allocations (October 2026)

- Workers AI: **10,000 neurons/day total per account**. @cf/openai/whisper-large-v3-turbo currently costs **46.63 neurons/min** and @cf/openai/whisper **41.14 neurons/min**. The theoretical maximum is ~214 or ~243 minutes/day respectively, *before any other model usage*. No paid overage is permitted.
- Workers Free: 100,000 requests/day, only 10 ms CPU per invocation (not enough for server-side FFmpeg or heavy compression).
- R2 Standard free: 10 GB-month storage, 1 million Class A and 10 million Class B requests/month. Quotas are account-wide, not a promise of unlimited audio storage.
- D1 Free: 5 GB total storage, 5 million rows read/day and 100,000 rows written/day.
- Queues Free: 10,000 operations/day and 24-hour message retention. D1 keeps durable jobs for multi-day continuation.
- Workflows Free: daily step quota; orchestration must batch work. Do not use one Workflow step per 30-second chunk.
- Cloudflare Containers require a paid account; **do not enable**. Craig's tiered paid transcription and auto-upload are also excluded.

Source: https://developers.cloudflare.com/workers-ai/platform/pricing/ , https://developers.cloudflare.com/workers/platform/pricing/ .

## Recommended no-charge strategy

1. Prioritize **Craig source link, speaker metadata and info.txt notes**. The TWE GM should not need a paid Craig subscription.
2. Prefer **AAC multitrack export** to reduce transfer/storage while retaining speaker tracks; offer FLAC when needed.
3. Prepare **two possible transcription paths** without promising a 3-hour single-pass Whisper call:
   - **Mixed audio path**, potentially fits one daily free AI allocation, but loses per-speaker labels. Useful when dialogue attribution is optional.
   - **Craig separate tracks path**, preserves speakers, but may take multiple days on the daily free AI allocation, especially 6 × 3 hours. Speech-only segmentation could lower demand but must be measured, not assumed.
4. Use browser-based/native audio conversion *only where tested* (the current PCM WAV planner cannot decode FLAC or AAC). An optional locally run open-source FFmpeg or Whisper pipeline may be needed for offline zero-cloud-AI use; it is NOT an installed or operational service in TWE.
5. Persist work in D1/R2 with resumable jobs, avoid loading entire session audio in a Worker. Let free quotas pause jobs rather than upgrading or charging.
6. Implement a **hard account-wide free quota gate** verified against Cloudflare's usage before enabling automatic inference. The legacy short-track prototype only asks for consent; it does not yet guarantee zero billing on a paid account. It is NOT approved as a general-purpose paid AI path.
7. Improve source-data imports: accept existing SRT/VTT/other text provided by GMs and display Craig /note events, independent of AI. Plain text is not a substitute for timestamps unless available.
8. Respect 7-day Craig expiry and user privacy, create an audio-retention policy with size quotas, and provide no-cost manual recap/journal editing throughout.

## Unresolved technical proof points

- Confirm the actual shape of Craig's info.txt content with a real recording before automatically parsing notes (current UI displays raw text).
- Confirm real multitrack AAC ZIP extension/mime variants and timing behavior. Newly added AAC extraction has not been tested against a real export.
- Validate free plan R2 transfer >90 MB: current endpoint still limits Craig archives to 90 MB; resumable multipart or browser-local processing is required.
- Confirm browser/device CPU/memory before attempting 3-hour on-device decoding.
- Test whether Workers AI accepts long AAC/FLAC directly and whether timing output is correct; never assume arbitrary byte cuts are valid chunks.
- Verify real account plan and live Workers AI neuron usage. No paid fallback.
