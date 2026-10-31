# Craig long M4A/AAC: bounded container demux and safety preflight

This increment adds a real ISO BMFF (MP4/M4A) **AAC-LC packet index reader**,
without pretending that it decodes compressed audio. A GM inspecting an original
Craig speaker recording can now see its verified duration, sample rate, and
number of AAC packets. The source stays GM-private; no provider transcription,
server-side conversion, or Drive write occurs from inspection.

## Operation

- The existing authenticated, ETag-pinned R2 source endpoint is used. Every
  request stays within the 1 MiB range cap; the AAC reader uses 512 KiB windows
  for the metadata atom and only 16-byte top-level atom headers.
- It locates the `moov` atom regardless of whether it precedes or follows
  `mdat`, with an 8 MiB maximum metadata budget. `mdat` is skipped instead
  of downloaded or copied into memory.
- Parses one unencrypted AAC-LC `mp4a` sample description, verified AudioSpecificConfig,
  media timescale, `stts` timestamps, `stsc` chunk mapping, `stsz` sample
  sizes, and 32-bit/64-bit chunk offset tables. Validates **all** packet sizes,
  timestamps and extents against the actual `mdat` atoms before confirming
  an index. Keeps compact source table arrays rather than allocating a
  separate object for every packet.
- Rejects malformed/inconsistent tables, unsupported codec profiles, unsafe
  index sizes, edit lists (which alter relative timing), composition offsets,
  fragmented MP4, alternate/encrypted sample descriptions and multi-audio tracks.
  These exclusions are deliberate: never silently shift speaker timing.

## GM-visible usage and limitations

- Inspect long Craig track now reports the real AAC duration and packet count,
  and explicitly warns that **long AAC decoding and Drive upload are not yet
  implemented**. Preparation button remains FLAC-only. No transcript is claimed.
- Read requests consume site-owner Cloudflare R2 operations. Their remaining
  quota is not available to TWE, so no invented free-operations balance is shown.
- Metadata scanning uses the GM's browser and normal network connection;
  cancellation is honored by the existing AbortSignal-backed range reader.
- Conversion still must be added using browser WebCodecs `AudioDecoder` or an
  audited locally bundled codec, consuming these individual packet offsets
  without whole-file `decodeAudioData`. Then reuse the rolling 16kHz PCM writer,
  SHA-256 resume checks, and **GM-owned Google Drive** chunk staging.
- Browser/platform AAC support and actual Craig 2–3h archive fixtures need
  real-world validation before enabling that path. Native Craig `.aac` files
  that are ADTS rather than MP4 are not handled by this demuxer.
- Background Gemini submissions remain **disabled** until per-GM billing,
  quota and Cloudflare Free runtime validation is complete. This change does
  not create site-owner API charges.

## Verification

Synthetic M4A test fixture includes a `moov` atom at the end, a complete
AAC-LC `esds` descriptor, duration and sample tables, and a small `mdat`.
Tests cover packet offset/timestamp accuracy, bounded header/metadata reads,
forged indexes, multiple audio tracks, rejected MIME and oversized source,
and honest UI wording.
