## Long recording handling

The native recap job now has a second, **format-verified** backend path for recordings longer
than 95 minutes. No different GM action is required: recording upload, explicit Auto Summarize
approval, saved versions, title suggestion and Journal publishing behave as before.

### Processing

- Short recordings retain their current single Gemini Files upload and single Interactions request.
- Long **CBR MPEG-1 Layer III MP3** and standard **PCM/float RIFF WAV** recordings use independently
  playable sections of approximately 35 minutes. Segment planning uses small authenticated
  Google Drive byte-range reads; it never downloads or transcodes a full 3-hour file in Workers.
- MP3 section boundaries are independently verified with consecutive MPEG frame headers, and
  compared against the original duration and bitrate. WAV sections include independently
  valid RIFF headers and sample-aligned data. No arbitrary 8 MiB HTTP chunks are submitted
  directly as playable audio.
- The existing bounded 8 MiB resumable Gemini upload protocol, AES-encrypted upload
  sessions and Gemini Files receipt checks are reused per section.
- Each section gets its own recorded Gemini interaction ID. A failed or ambiguous submission
  stops the job rather than silently using the GM's quota again. A completed section's
  notes stay immutable in D1; subsequent cron runs continue with the next section.
- Scene timestamps are shifted into the *original* full recording's timeline. A final
  text-only Gemini interaction combines all section notes and Journal context into one
  GM-reviewable Markdown recap. The original recording remains playable in the Journal.
- An ordinary 2–3h session will typically use 4–6 section requests **plus one final**
  text-only request, counting towards the GM's actual Gemini daily allowance.
  Provider quota and reliability remain model/project dependent; no guarantee of free capacity.
- On unsupported or malformed long audio (including MP4/M4A and FLAC containers), TWE
  **stops before any model submission**, preserving the original recording and explaining
  that a constant-bitrate MP3 or PCM WAV export is currently required. This avoids corrupting
  recordings or silently exhausting the GM's free allowance.
- Existing older jobs remain in single-file mode. Their previous results are never modified.
  A previously failed long single-file job is not silently resubmitted; a GM must approve
  a new attempt, as always.

### Technical constraints

Cloudflare Workers Free gives scheduled invocations only 10ms CPU and 128MB RAM.
Heavy audio decoding/FFmpeg is not suitable for that environment. This implementation
uses a bounded amount of metadata inspection and passes existing Drive ranges through
to Gemini. The cron continues one small operation per minute without site-owned paid
audio storage. If we later support M4A segmentation, it must use a proven remuxer with
verified free-tier resources, or a separate GM-side preprocessing step.

Completed child notes survive a later provider failure; safe resumability of such a
failure remains a separate follow-up, and no automatic potentially billable retry occurs.
