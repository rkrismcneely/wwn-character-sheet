# Session Recap — GM-owned audio storage and in-page playback

**Product requirement (2026-10-30).** Every Session Recap should be able to attach an audio recording and let authorized campaign members listen **directly on the TWE recap page**. The audio is stored in a **user-owned cloud account**, initially Google Drive; later support Dropbox, OneDrive and other providers through independent adapters. This is a core capability, not an optional future suggestion. TWE must remain free for its operator, while individual GMs may choose to pay for extra storage or provider tiers themselves.

## GM and player experience

1. The GM opens **Account Settings → Storage Providers → Connect Google Drive** and grants a separate, minimum-permission OAuth scope. Existing Google login to TWE does not grant Drive access.
2. The GM selects a storage connection and a file/recording for a campaign session. Save supported mixed audio (prefer browser-playable compressed formats such as M4A/AAC-in-MP4 or MP3), with optional Craig speaker-separated tracks.
3. Upload or import the audio directly into the GM's own storage with **resumable transfers**, not through a 90 MB TWE Worker upload. Keep a stable metadata reference in TWE: recording owner, provider, authorized connection ID, remote file ID, size, MIME, duration, recording/recap association, track/speaker mapping, and sync offset.
4. The **Session Recap page has an embedded audio player**: play/pause, seek, playback position, duration, and eventually speed controls, waveform, transcript timestamps, and 'jump to the moment' links from the recap or transcript. The default player uses a mixed recording; optional separate speaker tracks are available where a source provides them.
5. Any member whom the campaign's authorization policy permits to read the recap can listen. Other visitors cannot. **Do not require every player to connect their own Google account** just to play audio stored by the GM.
6. TWE shows useful states for disconnected storage accounts, deleted/moved files, quota exceeded, revoked access, and recordings still uploading. A GM can reconnect, replace a recording, move its storage provider, or disconnect; never erase remote recordings unexpectedly.
7. Retention is GM-controlled: keep the original audio in their provider, optionally remove temporary R2 processing objects after import, and allow explicit deletion of the association separately from deleting the underlying remote file.

## Google Drive implementation

- First provider: **Google Drive OAuth 2.0**, with the narrow **`https://www.googleapis.com/auth/drive.file`** scope for files created/opened with TWE. Avoid broad Drive access. A Google sign-in session is **not** Drive OAuth consent.
- Securely encrypt refresh tokens at rest; associate each with the owning TWE user, never a campaign globally. Do not expose OAuth access or refresh tokens, provider file IDs as bearer-like public links, or uncontrolled file URLs to other members.
- Upload files using Google Drive's **resumable upload** protocol, preserving progress and retry positions. Stream from a browser/local processor where practical so long 2–3 hour recordings are not copied through TWE's free server quota.
- For private in-page playback, investigate a **short, authenticated TWE audio route** that verifies campaign membership and storage connection access, requests the relevant Drive bytes using `files.get?alt=media` and a validated HTTP `Range` header, and streams response bytes without full buffering. The HTML audio player targets this same-origin route. Support `206 Partial Content`, duration and seeking, conditional requests and explicit no-public-cache headers.
- **Important cost/capacity gate:** relaying all audio through the site's Workers still consumes TWE requests and bandwidth and may be throttled by Google. Google Drive is personal file storage, **not a guaranteed CDN**. Benchmark this architecture for concurrent campaign listeners against the site's no-charge quotas before enabling generally. If the verified no-charge budget is too small, design a secure provider-native playback route or user-controlled sharing option without silently exposing recordings as 'anyone with link'.
- Do not grant public Drive permissions by default. Any 'share by link' or 'share with named Google users' mode must be separate, explicitly consented, and may not support campaign members who lack Google accounts.
- Drive's hidden `appDataFolder` is not a good home for accessible session recordings; use regular app-created files/folders under `drive.file`.

## Provider-independent abstraction

Implement `AudioStorageProvider` with conceptually these operations:
- `connect / reconnect / disconnect` with distinct OAuth scopes, token encryption and per-user status
- `beginResumableUpload / uploadChunk / resumeUpload / finalizeUpload`
- `getMetadata / openAuthorizedRangeStream / deleteRemoteFileOnExplicitRequest`
- `getOwnerQuota / classifyProviderError` when supported

All recap pages reference a **TWE audio asset ID**, not a provider-specific share URL. An adapter maps that ID to its actual provider and storage owner. Avoid tying recap timestamps, character-to-track relationships or playback UI to Google Drive schemas.

**Other storage providers to consider:** Dropbox (app-folder OAuth, resumable upload sessions), Microsoft OneDrive (Graph OAuth and Range-capable content URL), and later other approved GM-owned storage. Provider differences (temporary download URLs, playback permissions, bandwidth and quota limits) must remain inside adapters. Google Drive is the initial default, **not** the only planned option.

## Security and operating constraints

- Authorization applies on **every** playback request including `Range`; check that the member can read that specific session recap, not merely that the campaign exists.
- Never make the storage owner pay unexpectedly on behalf of another user, nor forward the GM's Google authorization to players. Rate-limit playback and storage operations within TWE's free capacity.
- Prefer progressive media playback, not full-file downloads or temporary R2 copies. Private GM-owned audio should not become publicly indexed.
- Define what happens when a GM leaves a campaign, revokes OAuth or deletes the backing file: clearly mark the recording unavailable and allow another authorized GM to relink their own copy.
- Validate file content types, duration, size, and playback compatibility. Do not assume a raw AAC stream is playable in every browser; test MP3 and M4A on Safari/iOS and Chromium.
- Preserve file/recap identity and time offsets when a new audio provider is substituted.
- **No owner-paid hosting or media processing.** A GM may have their own paid Google One or other storage subscription.

## Delivery order and acceptance criteria

1. Add provider-independent audio asset metadata model plus secure storage-account connection lifecycle.
2. Build Google Drive OAuth with `drive.file`, account-specific token encryption and resumable upload for recordings larger than the current TWE 90 MB limit.
3. Build private player endpoint with seeking, session authorization and tests; verify provider range behavior and TWE egress quota impact.
4. Add the player to Session Recap pages and connect transcript/recap timestamps to playback positions.
5. Validate with **real 2–3-hour sessions** including multiple speaker tracks, at least two concurrent listeners, revoked credentials, expired tokens, Safari/iPhone playback and missing files.
6. Add Dropbox/OneDrive adapters without changing the recap page format.

References:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://support.google.com/drive/answer/2423534

**Status (2026-10-30):** The per-user Google Drive OAuth connector, encrypted refresh-token storage, owner-only status/disconnect controls and one-use consent state are implemented in source; they remain disabled until Google OAuth credentials and a separate encryption secret are configured. See [Drive OAuth setup](../operations/recap-google-drive-oauth.md). Large-file uploads and in-page playback are **not yet implemented**.
