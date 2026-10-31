# Streaming full-length Craig FLAC to GM-owned Google Drive

This release adds actual streaming FLAC decoding and rolling WAV conversion for
isolated Craig voice tracks. It uses an **MIT-licensed** pinned
`@wasm-audio-decoders/flac@0.2.11` browser WebAssembly/Web Worker codec. The
site owner pays neither a transcoding service nor a third-party AI account.

## Workflow
1. Choose the recap's Craig import, the confirmed voice and a connected Google
   Drive account. Create or restore that GM's Gemini preparation job.
2. Click **Prepare entire FLAC in my Drive**. A private authenticated HEAD and
   64-byte header read confirm a source with a known timeline (1–8 hours),
   1–2 channels, and 16–96 kHz PCM.
3. TWE plans four-minute, mono 16kHz/16-bit WAV clips. The browser incrementally
   fetches up to 512 KiB of compressed audio per read (each Worker response is
   strictly capped to 1 MiB), decodes the FLAC stream in a browser Web Worker,
   downmixes/resamples through a fixed rolling ~7.7 MiB WAV buffer, and
   uploads each independently playable clip **directly into the GM's Drive**.
   Only one compressed source window and one output clip exist at a time.
4. After each successful Drive upload, the existing GM-authorized staging API
   records its digest, source timing, and Google Drive asset. The original Craig
   session remains speaker-mapped and private.
5. If the browser closes or a request fails, completed clips remain saved. On
   returning to this recap, select the same original Craig recording and repeat
   preparation. It must decode from the beginning to check original content,
   but **already staged matching clips are not reuploaded**.
6. Once all voices are prepared, the GM can seal the job; unattended Gemini
   transcription is **still disabled** pending per-user quota/billing checks.

## Warnings and usage progress
- The UI displays observed source bytes, four-minute clip progress, Drive
  upload bytes, percentage, and estimated Drive space. R2 reads per track
  are approximately `ceil(original compressed bytes / 512 KiB)` plus a few
  metadata reads. These use site-owner R2 read operations; remaining free quota
  is *unknown* and not invented.
- GPU is not required for the FLAC decoder. The user's browser/device CPU,
  WASM and network are used. The page must remain open while processing.
- Flac only: `M4A/AAC` needs a separate MP4 demux/decode path.
- This phase does not auto-submit a recording to Gemini, and does not give
  a fake remaining Gemini/Drive quota value.
- A source with missing FLAC sample-count metadata, corrupt PCM, an incompatible
  sample rate, changed source ETag, or a transcript-ready clip hash mismatch
  stops rather than guessing or publishing partial captions.

## Validation
A representative 3-hour 48kHz stereo timeline is 45 independently timed
4-minute speech WAV clips per voice, with a fixed rolling buffer instead of
decoding all 3 hours. Unit tests validate output headers, downmix, cancellation,
clip bounds, mismatch handling and checksum-resume wiring.

**Runtime QA still needed**: Real 2–3h multitrack Craig FLAC recordings on
Chrome, Safari and Firefox, workers/wasm bundling, long-run audio quality and
performance, and local Cloudflare R2 read operation usage. A test fixture
and a verified end-to-end dry run should precede advertising it as fully
production reliable. The Account Summary Wizard will explain these
per-device costs, limits, and optional services later.
