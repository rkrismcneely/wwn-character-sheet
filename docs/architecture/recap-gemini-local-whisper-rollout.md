# Session Recap transcription provider rollout

## Built in this change
- Groq remains unchanged as an existing GM-owned model option.
- Gemini 3.5 Transcribe foreground route uses GM's per-session Google AI Studio key, the official Files API and Interactions API with word timestamps, and server-confirmed speaker associations. Private transcript merging is idempotent.
- Local Whisper uses pinned open-source Transformers.js + Whisper tiny.en in the GM's browser. WAV chunks are audio-aware, not byte slices of compressed media. Completed chunks persist privately with receipts; a File System Access handle may be retained **only by explicit GM choice**, never a second copy of the audio.
- The choice UI shows pros/cons before starting, with truthful labels and no owner-funded inference.

## Still required before unattended Gemini can be enabled
**Do not advertise Gemini as unattended until the full queue is tested.**
1. Securely link per-GM Google AI Studio API keys with AES-256-GCM, key rotation and revocation. A GM may be on a billed project; never assume free quota or silently change tiers.
2. Store the original audio durably in **GM-owned** Drive or a similarly delegated service rather than unlimited owner-funded R2. Check consent, refreshable access and quota, file availability and deletion.
3. For multi-hour Craig FLAC/AAC, implement a real media decoder/transcoder that can generate valid 30-minute-or-shorter timestamped clips. Never split compressed audio arbitrarily by byte range.
4. Add durable D1 job/chunk status, lease tokens, retries with backoff, per-GM request limits and confirmed silence receipts. An explicit job creation control should persist source reference, provider/account, speaker snapshots, clip offsets, and next eligibility time.
5. Add Cron trigger (Cloudflare free plan has a 10ms CPU-time budget per cron invocation). Ensure its work is mainly I/O rather than audio encoding/decoding; long CPU jobs must stay in the browser or be offloaded.
6. Worker uploads next eligible chunk to Gemini Files API, starts a timed Interactions API call, validates word offsets, writes private transcript with optimistic concurrency, advances job and removes stale temporary files. Preserve state across provider 429/503, outages and browser shutdown.
7. Limit data storage, request rate, processing concurrency and total tasks to prevent site-owner infrastructure charges; fail closed when allowances can't be verified. Retry budget must not accidentally burn GM-paid tokens after a timeout.
8. UI polls only for progress, does not own work; allow explicit pause/disconnect/cancel and show next eligible attempt. Give GM a ready indicator for review, never automatically publish transcript or AI recap.
9. Test a real representative 2–3 hour **multitrack** Craig session across quota resets, owner permissions, expired Google Files links and Drive refresh-token rotation.

## Local Whisper resume details
- In compatible browsers with File System Access + IndexedDB clone support, an explicit remembered-file picker stores the *handle* locally, not audio bytes.
- When opening the recap again with permission still granted, TWE can reopen the file and resume checkpointed chunks without clicking Start.
- If browser permissions are lost or the file is moved, the GM must reauthorize/re-select it.
- The browser tab must stay open and the machine awake during inference. Browser CDN/CSP/WebGPU model-loading and performance must be tested on actual devices before this is considered stable. Tiny.en is an intentionally small English model, not a promise of high-quality multilingual accuracy.

Official references:
- https://ai.google.dev/gemini-api/docs/transcribe
- https://ai.google.dev/gemini-api/docs/files
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.cloudflare.com/workers/platform/limits/
- https://huggingface.co/docs/transformers.js/en/installation
