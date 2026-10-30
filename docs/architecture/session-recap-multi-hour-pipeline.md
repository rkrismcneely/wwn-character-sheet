# Session Recap v2 — 2–3 hour recording architecture

Status: **design and capacity guardrails; not a deployed long-recording processor**.
**Billing clarification (2026-10-30): TWE's operator pays $0. An individual GM may use their own paid Craig, Groq, Gemini, or other provider plan. This document's previous paid-Container discussion is superseded by the browser-local media processing strategy and [bring-your-own-provider policy](recap-bring-your-own-provider.md).**
The earlier Craig import and short-track review remain available independently.
This plan intentionally avoids turning on new background transcription or paid infrastructure.

## Default workload and non-negotiable behavior

- Treat **2–3 hours** as routine; support up to 8 hours where source permits.
- 1–32 source tracks; six separately recorded Craig speakers is an ordinary case.
- 3 hours × 6 tracks × 30-second boundaries = **2,160 potential windows** before voice activity detection.
- Do **not** create 2,160 sequential Workflow steps: Cloudflare Free allows 3,000 Workflow steps/day, and even the paid step count would introduce needless orchestration overhead.
- One GM click queues an **idempotent** run with visible progress, failure/retry controls and a usable browser-independent state. Never start AI processing implicitly.
- A GM explicitly opts into their own paid provider, if desired, with a conservative **per-job spending ceiling** shown wherever measurable; TWE never sponsors inference charges. Stop before exceeding a GM's configured cap.
- Show a truthful processing status; never report an import as transcribed or published until its stages are verified.
- Never store Craig access keys or private audio object URLs in client responses or log entries.

## Provider-independent lanes

1. **Craig separate tracks**: import the zip while it is available (Craig recordings currently expire after seven days). Inspect metadata, synchronize, decode FLAC in a media runtime, detect speech, segment, transcribe with speaker labels attached by source track ID.
2. **Ordinary uploaded audio**: resumable multipart upload (MP3/M4A/WAV); the same media pipeline handles decoding/segmentation; diarization is an optional provider capability and must not silently invent speaker identity.
3. **Existing timed captions**: accept Craig-supported VTT/SRT with timestamps and speaker cues when available; validate and merge without re-transcribing audio. No audio inference costs in this lane.

First two lanes need a real audio decoder such as FFmpeg. The existing PCM WAV planner does *not* decode FLAC or M4A and must not be used as though it does.

## Cloudflare roles

| Service | Responsibility |
| --- | --- |
| Worker routes | GM authorization, consent, job start/status/cancel, short JSON responses only |
| D1 | Authoritative job state, progress counters, idempotent chunk IDs, leases, concurrency, cost ceilings and retention policy |
| R2 | Private original audio, immutable normalized chunks, timestamped segment output per chunk, source captions and draft artifacts |
| Workflows | Durable **stage-level** orchestration (not a step for every 30 seconds), recovery and bounded retries |
| Queues or a bounded task dispatcher | At most 1–4 concurrent chunk inference calls per job, with back-pressure and replay safety |
| Media processor | Browser-local Craig-compatible decoder / open-source local tools; no site-owner-paid Container |
| Transcription provider adapter | Whisper / imported captions / future alternatives; normalized timings and safe provider swapping |
| Recap generator | Multi-pass event extraction, character/location resolution, synthesis with timestamp citations, GM review |

Cloudflare Workflows has 1,024 steps / execution on Free, versus 10,000 default on Paid; daily Free step usage is 3,000. Therefore persist individual chunk metadata externally and keep orchestration steps proportional to **stages or bounded batches**, not every audio fragment.

## Durable data flow

- Upload or import creates a stable **source ID**, checksum if available, MIME and byte size. Multipart uploads support pause/retry, with strict auth and per-campaign quotas.
- A GM approves the provider, session date, speaker identities, retention and spending ceiling.
- A durable job is created idempotently per requested run. Job state machine: `awaiting_source → queued → preparing → transcribing → assembling → awaiting_review → completed`, or `failed` / `cancelled`.
- Each chunk gets `(job_id, track_id, chunk_index, start_ms, end_ms, status, attempts, storage_key)`. A unique constraint on that tuple plus a lease and idempotent commit prevents duplicate processing across retries.
- Chunks are written to **immutable R2 keys**; never rewrite a whole three-hour transcript on each completion.
- Transcript assembly is a read of completed chunk outputs sorted by absolute time and stable track ID. An assembler can produce preview pages without loading the entire transcript into a Worker.
- Reattempts and edits of individual chunk ranges must preserve other tracks and all out-of-range speech.
- Stage-level state in D1 is independent of browser sessions, Cloudflare's Workflow retention and incidental Worker failures.
- D1 and R2 retention/cleanup are governed by campaign policy. Show exact proposed removal before performing destructive deletion.

## Transcription and cost policy

- Use voice activity detection to skip silence, but keep the original audio timebase; transcription billing estimate is conservative **all-track wall-clock duration** until the VAD implementation is validated.
- Initial Whisper model rate checked on 2026-10-29: **USD $0.000513 per audio minute**. For six 3-hour tracks, the theoretical all-audio inference rate component is 1,080 minutes × $0.000513 = **$0.55404**, excluding container, R2, workflow, queue and any other model usage. Rates and free allowances change; refresh before presenting user-visible costs.
- Only estimate transcription costs when a verified current unit price is supplied; the domain planner does not hardcode billing rates.
- Do not claim silent windows are free until silence detection and provider billing behavior are verified.
- Long recaps require multiple passes, each bounded by context limits; preserve event timestamps and links to source audio/transcript for GM review.

## Validation and rollout gates

1. Merge planning/tests without changing live import behavior.
2. Add additive D1 processing-job/chunk schema, migration-before-deploy checks and GM-only status endpoint. Do not show a misleading “Generate” button yet.
3. Implement large multipart upload, resumable Craig import, TTL and quotas. Existing 90 MB endpoints remain marked legacy until replaced.
4. Validate actual Craig archives and a representative 2–3 hour recording, including late speakers, silence and overlapping speech, and compare provider transcript accuracy and timing.
5. Select and verify an FFmpeg runtime **with explicit operational/cost approval**; prove full FLAC decode and source alignment before running expensive inference.
6. Add durable background dispatch in batches with strict leases, bounded concurrency, cancellation and spend ceilings.
7. Build scalable transcript pagination and timestamped speaker mapping, followed by multi-pass recap generation with source citations.
8. Roll out behind a flag; run one private multi-hour acceptance test before declaring general availability.

## Known limitations of the earlier prototype

- 90 MB import limit, 80 MB FLAC track limit, and 2 MB Whisper endpoint.
- Single R2 JSON transcript object with 1,500-segment / 300,000-character validation, subject to lost updates on concurrent writes.
- Manual Craig track assignment, arbitrary per-entry extraction actions.
- PCM-only WAV chunk planning is not compressed FLAC segmentation.
- No background scheduler, resumable upload/transfer, cost cap, or real three-hour end-to-end acceptance test.

Do not remove or silently rewire existing manual recap creation during migration.
