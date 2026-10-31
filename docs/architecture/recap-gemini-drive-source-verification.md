# GM-owned Google Drive clip verification before unattended Gemini

## What this implements

A **server-only** source reader for audio prepared in the previous Gemini
staging phase. The reader accepts immutable job/GM/recap/track identity, never a
client-supplied Drive URL. It checks the D1 relationship between the scheduled
job, the user-owned Gemini credential, the user-owned Drive connection and the
specific Google Drive file created for the clip.

The reader refreshes the GM's own delegated Drive OAuth token and then uses the
fixed Google Drive REST endpoint to verify metadata, including the private
TWE campaign and audio-asset markers. It downloads one small file directly
into the Worker, without storing it in the site's R2 bucket. It validates:

- strict byte bound (maximum 12 MiB), rejecting redirects, partial HTTP results,
  oversized Content-Length or unbounded response streams;
- same Google file ID, MIME, exact size, upload markers, non-trashed status;
- valid RIFF WAV header, mono 16 kHz, 16-bit little-endian PCM,
  independently playable duration matching the recorded clip timeline;
- exact SHA-256 match against the original locally staged audio.

The returned bytes remain **server-private** and can be immediately passed to
a future Gemini uploader. They are not returned in client APIs, placed into
logs, or copied into site-owner storage.

## GM test control

After a job has been fully prepared and sealed, the GM may explicitly click
"Verify one saved clip from my Drive" to check one prepared clip. This
performs no Gemini requests. To bound server and Google Drive traffic, the
endpoint rate-limits verification to one attempt per job every two minutes
using a conditional D1 update, and stores only an audit timestamp. The test
does not imply that every clip is verified.

## Remaining gate before 24/7 transcription

- Check the same byte-level integrity for **every** clip immediately before
  sending it to Gemini; never trust just the GM's saved hash.
- Recheck job cancellation/paused state and account validity immediately before
  provider submission, not only before the Drive read.
- Implement the scheduled runner, explicit GM-owned project quota policy, safe
  consent/billing controls, and exact-once completion receipts. Free-only
  inference must remain disabled unless verified without spending money.
- Then add audio fragment result storage, assembly and GM review, and test
  an actual 2–3 hour Craig multitrack session with quota pauses.
- Native Craig FLAC/AAC streaming decode still requires separate work; the
  WAV staging path isn't a general decoder. File upload/processing remains
  foreground until initial staging completes.

Current status: manual verification is a preflight feature, **not unattended
Gemini transcription**. The site's paid AI binding is never used.
