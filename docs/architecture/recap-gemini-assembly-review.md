# GM-private Gemini transcript assembly and review

## Intended use
After the scheduled Gemini worker finishes the last prepared Craig audio clip,
the job enters `awaiting_review`. That does **not** publish a transcript.

A bounded assembler runs before another Gemini submission in an enabled
Cloudflare scheduled tick. Each invocation reads up to four completed,
timestamped fragment objects, validates their exact job/recap/track/clip
identities and saved Craig speaker assignments, then updates a private
assembly object with a checkpoint. This works for typical 2–3h multitrack
recordings without a one-shot 225-fragment memory spike.

## Safety
- Each fragment must match the D1 row's exact internal storage key and timing.
- Cross-track dialogue is sorted into a session-relative timeline.
- The original Craig speaker role, display name, and character assignment
  are preserved; anonymous labels or fabricated timestamps are rejected.
- Known silent fragments count as completed but never create fake dialogue.
- R2 writes use ETag compare-and-swap and a D1 lease per job. If R2 commits
  but the D1 cursor update is lost, the next tick resumes using the
  stored checkpoint; a completed checkpoint can be reconciled.
- The assembled object is stored under a job-specific private key; it does
  **not** overwrite the existing editable transcript or become player-visible.
- Existing 10,000-caption, 1,000,000-character and 2 MB private-draft limits
  apply; overflow fails closed rather than silently deleting dialogue.
- Bad or missing fragments pause the job with an assembly error rather than
  publishing partial material.
- The service never uses site-owner AI credentials or triggers extra Gemini
  transcription requests during assembly.

## GM review
The GM can open Gemini > Prepare session > **Check assembled transcript**
to see progress and a private dialogue preview, including character names.
Once complete, **Load into private transcript for review** copies all verified
captions into the existing Full Session Transcript editor. A previously
saved unpublished transcript requires an explicit replacement confirmation
and exact last-updated version match; a published transcript must first be
unpublished. R2 optimistic concurrency prevents another tab's changes from
being silently overwritten.

The GM then uses the existing transcript review search, speaker verification
and explicit Publish button. There is no automatic publication.

## Deferred tasks
- Enable Gemini unattended execution only after per-GM project billing
  verification and Cloudflare Free runtime tests; the existing scheduler
  feature gate stays off by default.
- Add native decoding for full Craig AAC/FLAC tracks and test representative
  multitrack sessions on actual user devices.
- Build **Account > Summary Wizard** once manual/assisted/automated processing
  is reliable and configurable. Let GMs rerun the wizard or edit each
  setting individually without overwriting their existing recap drafts.
