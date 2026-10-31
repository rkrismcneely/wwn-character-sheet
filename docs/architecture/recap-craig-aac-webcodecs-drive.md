# Long Craig AAC-LC -> browser WebCodecs -> GM-owned Google Drive

The existing Craig M4A atom/packet index is now consumed by a bounded
**browser-native AAC-LC WebCodecs AudioDecoder**. This implementation does
not install a paid transcoding service, or send recordings to any
site-owner-hosted AI model.

## GM flow
1. Confirm Craig speaker associations and connect the GM's own Google Drive.
2. Open the Session Recap Gemini preparation pane and select the speaker.
3. Click **Prepare full Craig audio (FLAC or AAC) in my Drive**.
   The private, ETag-pinned Craig source returns a bounded MP4 metadata index;
   audio is read in 512 KiB windows, not individual AAC requests.
4. The browser checks `AudioDecoder.isConfigSupported` for AAC-LC. It
   decodes up to 192 packets per batch, materializes at most 256 small output
   blocks in a queue, and always closes WebCodecs `AudioData` objects.
5. Existing rolling writer downmixes/resamples to 16kHz mono PCM,
   emitting independent <=4-minute WAV files, one at a time. They are
   uploaded directly to **the GM's** connected Drive, SHA-256 compared against
   any existing staged clips on retry, and recorded through the existing
   authenticated plan/attach endpoints.
6. Closing the page, switching tabs, disconnecting, or pressing Stop
   interrupts conversion; completed Drive clips survive. On return,
   conversion rechecks the **whole original track** and skips uploaded
   clips with matching hashes. Background transcription is still disabled.

## Failure cases and warnings
- Browser support for WebCodecs/AAC differs across operating systems and
  browsers. An HTTPS secure context and a compatible browser are required.
  If unsupported, use Craig FLAC or export PCM WAV and prepare through
  the existing flow. No WebAudio whole-file decode is attempted.
- MP4 edit lists, fragmented MP4, ADTS-only AAC, HE-AAC, encrypted M4A,
  codec/sample-rate/channel mismatch, or fractional AAC packet sample
  durations are rejected. Exact frame count must match the MP4 sample
  timeline: no fabricated silence and no silent timeline shifts.
- Output buffers and network windows are bounded; large multi-hour
  recordings are never decoded into a whole-session AudioBuffer.
  GM browser CPU/network remains active **only while that page is open**.
- Source metadata and compressed bytes are served through the existing
  site-owner Cloudflare R2 infrastructure. Every bounded read consumes
  Cloudflare operations. Remaining site-owner free quota cannot currently
  be observed; do not invent a usage balance. The UI reports actual
  AAC packets, R2 byte reads/read count and completed Drive clip progress.
  GM-owned Drive storage is estimated from actual WAV output parameters;
  remaining Google storage and Gemini quota are not guaranteed.
- Existing private Gemini scheduled processing remains **off**, pending
  verified per-GM billing/free-tier safeguards and Cloudflare Free runtime
  tests. Preparing audio **does not** submit anything to Gemini.
- A real Craig two-/three-hour AAC session needs QA on Safari, Chrome,
  Firefox and mobile browsers to validate decode support, audio quality,
  resume determinism and speaker timing before calling it universally
  reliable. This is a functional implementation, not a compatibility
  certification.

## Automated coverage
Synthetic AAC decoder injection verifies exact output WAV headers and
timeline, 192-packet batching with reusable 512 KiB source windows,
channel downmix, unsupported browser guards, malformed PCM, provider
decoder errors, abort cleanup, and unchanged GM-owned Drive digest
staging. Existing FLAC and MP4 safety tests remain active.
