# Craig short native audio + usage transparency (Phase 1)

This is a **bounded native browser decode path**, not a general multi-hour
FLAC/AAC streaming decoder.

## What works
- The GM chooses a confirmed Craig speaker from the saved session import.
  TWE shows the source filename and original size where the Craig archive's
  manifest provides it.
- For **short** FLAC or MPEG-4 AAC (M4A/MP4) tracks under 16 MiB and with a
  verified duration of no more than four minutes, the GM may load the original
  privately or select their own short compressed file.
- Browser-native Web Audio decodes the short file locally (no external paid
  media service). Browsers that don't support a codec fail with a clear
  explanation and retain the PCM WAV workflow.
- The decoder **first probes metadata duration**. Unknown or >4min duration
  fails closed before the compressed bytes can be decoded. After decoding it
  caps PCM memory at 96 MiB, one or two channels, and 8–96kHz source rate.
  It resamples/downmixes to playable mono 16kHz, 16-bit RIFF WAV.
- The resulting WAV is uploaded using the existing authenticated, GM-owned
  Google Drive staging route and SHA-256 resume checks. The site owner
  doesn't receive the source audio or pay for audio transcode services.

## Usage and consent UI
- Each selected voice displays count and estimated bytes of newly prepared
  WAV files **in the GM's Drive**, not site-owner storage. The estimate is
  based on actual chunk frame counts, not source compression ratio.
- Google Drive's upload callback shows *actual acknowledged bytes*, current
  upload percentage, and completed/staged clip count.
- The job view shows explicit numeric progress for prepared clips, completed
  transcription clips, in-progress/submitted clips, and failures.
- The UI prominently explains Google Drive storage usage, potential Gemini
  charges on the GM's own project, and that Gemini free-tier quota remaining
  **is not exposed** by the current TWE connection. It links to the Google
  AI Studio usage dashboard rather than guessing remaining requests.
- The user still must explicitly approve the future audio sharing/billing
  consent. This phase **does not enable background Gemini inference**.

## Deliberate limitations
The four-minute ceiling protects browser memory. A three-hour 48kHz stereo
AudioBuffer can require about 4.1 GiB in floating-point samples alone; do not
attempt to make the browser decode that whole recording using decodeAudioData.
The existing Craig private download endpoint additionally limits files to
16 MiB. Browser-native FLAC support varies and can be absent.

**Full-length, multi-track Craig AAC/FLAC requires a true streaming decoder**
with verified chunk boundaries, controlled browser memory, resumability,
and real-device tests. This limited improvement does not claim otherwise.

The AudioContext may consume significant transient device memory even for
short sources; 96 MiB is the decoded buffer cap after conversion, not a
guarantee of peak browser memory.
