# Full-length Craig: bounded source access (streaming decoder prerequisite)

## New private audio source endpoint
`HEAD /api/campaigns/:campaignId/recap-imports/craig-track-range?importId=...&entryIndex=...`

This HEAD request returns only MIME, file length, ETag and max-range size.
It requires authentication, GM Craig-import access, a ready saved archive,
a separately extracted original audio track and a confirmed Craig
speaker-to-character association.

`GET` to the same URL requires:
- A single explicit `Range: bytes=start-end` of at most **1 MiB**.
  Whole-file, suffix, indefinite, multipart, out-of-bounds and oversized
  requests fail closed.
- An exact `If-Match: "<etag>"` matching the previously checked source.
  A changing original cannot silently corrupt a partially decoded session.
- The same user/GM/ready-import/speaker/format authorization as HEAD.

The Worker streams only the requested R2 range (HTTP 206, exact
Content-Range, Content-Length, ETag) without turning it into an ArrayBuffer.
Input is limited to a **256 MiB** original extracted Craig track, restricted
to FLAC or MPEG-4 AAC declared by the saved extraction. The source has
`Cache-Control: private, no-store`, same-origin resource policy and
`nosniff`; neither the Craig recording token nor underlying R2 keys are
returned.

## Browser usage
- One range reader fetches and verifies the initial HEAD metadata.
- Each subsequent read requests at most 1 MiB with the pinned ETag and
  rejects unexpected 200 responses, changed ETags, incomplete byte ranges,
  wrong byte counts, or invalid source identities.
- The range reader reports **actual received bytes**, not simulated
  transcription percentages. A FLAC STREAMINFO probe reads just the first
  42 bytes and can report the real length/sampling rate if present.
- The Gemini staging screen adds **Inspect long Craig track** to verify
  large original audio and show MIME/bytes/duration (when available)
  without decoding it.
- On browsers supporting File System Access, GMs may **Save original to
  computer (streaming)** with real transfer progress, writing successive
  bounded 1 MiB chunks instead of buffering the whole compressed file.
  This is an optional manual-conversion fallback, not an automated recap.
- Both actions offer cancellation; original uploaded assets and existing
  transcript job data are left unchanged.

## Usage warnings (required by this feature)
- Show the original source size and bytes actually transferred.
- Show **Cloudflare R2 read-operation costs/limits as unknown**;
  small range requests still use site-owner R2 reads. Never invent an
  available free-read quota.
- The full-length file is *not yet decoded or transcribed* by this pathway.
  The original Session Recap Gemini auto-runner remains disabled.
- The GM's Google Drive capacity and Gemini project remaining quota are
  separate concepts, not inferred from the original Craig bytes.

## Remaining decoder work
Use the range reader as the input to a real **streaming codec pipeline**:
- FLAC: pinned, locally bundled MIT-licensed WASM streaming decoder,
  stateful per-frame decode with bounded PCM-to-WAV conversion.
- M4A/AAC: bounded MP4 atom/sample-table demuxer plus WebCodecs
  AudioDecoder, with strict AAC codec capability check, timeline handling,
  and safe browser fallback.
- Preserve exact time boundaries and Craig speaker mappings, checkpoint
  completed GM Drive WAV clips, and demonstrate bounded memory with
  2–3-hour multi-speaker fixtures on actual browsers.
- Do not attempt `decodeAudioData` of a full compressed multi-hour
  recording.

No new paid third-party media service or automatic provider inference has
been enabled by this source-access phase.
