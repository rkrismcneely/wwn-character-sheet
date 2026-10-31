# Saved Gemini jobs: recovery and progress

## GM behavior
A GM's Session Recap > Gemini > Prepare Craig recording now fetches saved jobs
from D1 when the page opens. Jobs are linked to the current recap and to the
GM's **own** TWE user ID, even when multiple GMs share the campaign.

- Restores the saved Craig import, speaker tracks, prepared Drive clips and
  timestamped chunk progress after the browser is closed and reopened.
- Offers a picker if there are multiple jobs for this recap.
- Shows counts of pending, leased, submitted, completed, failed and skipped
  chunks. The UI refreshes once per minute while open or on demand.
- Pause and resume are per initiating GM. A paused job retains prepared
  audio, Gemini interaction IDs and completed transcript fragments.
- Cancel is terminal and requires confirmation. The current queue has a
  unique import ID, so the same Craig import cannot simply be restarted
  as a new job; prepared Drive files are **not** automatically deleted.
- The server never exposes an API key, Google Drive file ID, source recording
  token or signed private URL in the job status response.
- The UI continues to say that **unattended Gemini inference is disabled**.

## Important migration 0046
Earlier migrations created the chunk table with a CHECK restricting status to
pending/leased/completed/failed/skipped. The scheduled worker stores a
`submitted` status and interaction ID before it can safely resume polling.
The old CHECK would reject exactly this critical checkpoint.

Migration 0046 uses SQLite's create/copy/drop/rename pattern to rebuild the
chunk table with `submitted` allowed, while preserving all existing columns
and their contents, including Drive assets and provider interaction IDs.
It recreates the original four indexes and continues to enforce foreign keys
and the completed/fragment and submitted/interaction invariants.

The migration is tested by applying earlier chunk migrations to a local
SQLite database with foreign keys on, inserting pending and completed jobs,
applying the rebuild, verifying all columns/rows are identical, and exercising
the submitted state.

## Still outstanding
- Per-GM provider billing/free-tier verification before enabling unattended
  Gemini requests. There is no safe global "all users are free" flag.
- Cloudflare Free CPU/runtime measurements for per-clip hashing and transcoding.
- Full native Craig AAC/FLAC decode (the current preparation accepts PCM WAV).
- Account Summary Wizard for manual, mixed and automated recap preferences.
