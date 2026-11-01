## Long recording handling (Gemini with GM-owned Google Drive)

The existing **Auto Summarize** confirmation supports sessions longer than 95 minutes
without requiring the GM to split, convert, or reupload their original recording.

### Verified inputs and segmentation

- **AAC-LC M4A**: TWE reads the original ISO Base Media File Format sample tables
  (`moov`, `stts`, `stsz`, `stsc`, `stco`/`co64`) through bounded Drive range
  requests. It checks one audio track, one AAC decoder configuration, a
  contiguous sample payload, valid timing and size limits. Sections are
  assembled as valid new `ftyp + moov + mdat` streams that reference their
  ORIGINAL audio sample bytes without transcoding. The recording stays in Drive.
- **Silence-aware split for M4A**: Encoded AAC packet sizes can sometimes indicate
  sustained low activity (particularly variable-rate recordings). We require
  a marked reduction over approximately 2 minutes, near a valid section
  boundary. **This is a heuristic and cannot prove silence**: constant-bitrate
  AAC or background music will not provide reliable detection. In that case
  TWE uses evenly balanced times rather than pretending to hear a break.
- **PCM WAV**: TWE samples small source ranges near candidate times and uses
  actual 16-bit audio RMS measurements to prefer low-level windows; other
  sample encodings fall back to timed cuts. It writes independently valid WAV
  headers and preserves sample alignment.
- **Constant-bitrate MP3**: Boundaries use independently verified MPEG frame
  headers; full-file Xing/Info duration metadata is omitted from the first
  virtual section. Its present silence search remains future work, so splits
  are timed and frame-aligned.
- Most 2–3-hour recordings should now need **two audio analyses plus one
  final text-only consolidation**. Each section is capped around 100 minutes
  so the estimated ~192,000 audio tokens stay below the GM's observed
  250K/minute input-token ceiling with some room for Journal context.
  Actual quotas vary by model, tier and project, and provider requests
  may still fail. Long/awkward recordings use more sections.
- Over-limit, malformed, encrypted, multi-configuration, fragmented, or
  interleaved M4A media is **rejected before any billable model request**.
  Do not guess bytes or permit silently corrupted AAC audio.

### Background and state

The existing 8 MiB resumable Drive-to-Gemini Files bridge is reused.
For M4A it prepends bounded remuxed metadata to the matching original
compressed-audio byte range. Every section has its own durable D1 checkpoint,
provider receipt, interaction ID and scene notes. The final Gemini text-only
request assembles a single GM-reviewable Markdown recap using the original
recording timeline. Timestamp seeking, original audio, prior recap versions,
Journal references, and explicit per-recording consent remain unchanged.

Completed section notes are reused across new detail levels for the SAME
GM/campaign/recap/audio asset when all recorded boundaries match. An
uncertain Gemini POST is never automatically repeated.

### Resource and rollout considerations

Workers Free allows only 10ms CPU per request/cron invocation, 128MiB memory
and 50 subrequests. M4A parsing/remuxing is designed to be small, bounded
and metadata-only, but **needs a real-world 2–3-hour M4A validation** against
the actual Cloudflare runtime before production reliability can be claimed.
M4A with large or unusual metadata fails closed; it never uses arbitrary
8MiB HTTP transfer chunks as standalone audio sections.

Native AAC sample sizes are not decoded waveform silence detection.
Accurate digital silence detection for any AAC bitrate would require
dedicated decoding and a separate viable free-tier compute architecture.
