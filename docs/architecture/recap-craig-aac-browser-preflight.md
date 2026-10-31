# Craig AAC browser sample compatibility test

This follow-up to the WebCodecs streaming AAC feature (#589) provides a
small, **no-upload** diagnostic that a GM can run against an actual
already-confirmed Craig speaker track before preparing hours of audio.

## GM workflow

1. Choose a Craig AAC/M4A speaker track on a Session Recap.
2. Press **Test AAC in this browser (no upload)**.
3. The app reads the private AAC atom metadata, checks
   `AudioDecoder.isConfigSupported`, fetches up to 48 real compressed
   AAC packets through authenticated, ETag-pinned source ranges and asks
   the local WebCodecs decoder to produce actual finite PCM.
4. The UI reports observed decoded seconds, packet count, sample rate,
   channels, compressed audio bytes and number of R2 reads. Audio
   resources are closed on success, abort and failure. No Google Drive
   files, Gemini provider requests or transcription jobs are created.
5. On failure, the GM can use FLAC or a standard PCM WAV export instead.
   On success, full conversion remains a separate explicit action.

## Cost, privacy, and reliability

- The test uses device CPU and network; it is **not** a paid service.
  Its private R2 reads consume TWE site-owner read operations, including
  metadata scans. Remaining free R2 quota cannot currently be queried;
  no fake quota balance is displayed.
- The audio remains in the GM's private Craig import and in their browser.
  This test does **not** copy a recording to Drive or to any external AI.
- Success confirms only that this device/browser can decode a short
  sample. It **does not certify** a 2–3h end-to-end run, processing rate,
  large-file source stability, speaker attribution, codec-specific
  AAC priming, or final WAV audio fidelity.
- It is intentionally restricted to at most 48 AAC packets and about
  512 KiB of source per normal read, plus bounded metadata reads; no
  whole-session AudioBuffer or minute/hour-long PCM allocation occurs.
- If the browser is incompatible or the packet stream fails, return an
  actionable error without staging incomplete audio. Aborting closes
  the decoder and retains any unrelated previously staged Drive clips.
- Automatic Gemini requests remain disabled until the GM billing/free
  quota gates and Cloudflare Free runtime have been independently
  validated.

## Tests and remaining acceptance

Automated regression checks cover a virtual 2h/3h packet timeline
yielding exactly 30/45 four-minute WAV plans, the no-upload 48-packet
probe of a simulated 3h source, finite decoded PCM, source read bounds,
absence of provider/Drive calls, unsupported codecs, corrupt output,
empty results, cancellation and resource cleanup.

**Manual QA remains required:** Test actual 2–3h Craig AAC and FLAC
exports on supported browser/device combinations, including Safari,
Chrome and Firefox where WebCodecs AAC support varies; verify audio
quality, multi-speaker alignment, intermittent connection recovery,
Cloudflare R2 usage, Drive uploads and restaging across interruptions.
Do not mark production media processing universally supported until
real-file QA passes.
