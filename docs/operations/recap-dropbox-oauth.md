# Dropbox session-audio storage (GM-owned)

Google Drive remains supported. Dropbox is an **optional, separately authorized**
storage destination for original recap recordings. TWE stores file references and
encrypted refresh credentials, never a second audio copy in the application database.

## Site setup

1. Create a Dropbox API app at https://www.dropbox.com/developers/apps.
   Prefer **App folder** access; with Full Dropbox access, TWE only creates and
   uses its own `/Tales Without End/Session Audio/` folder.
2. Enable the scopes: `files.content.read`, `files.content.write`,
   `files.metadata.read`, `account_info.read`.
3. Add exact OAuth redirect URI:
   `https://taleswithoutend.com/api/account/storage/dropbox/callback`.
4. Configure production Cloudflare Worker secrets `DROPBOX_APP_KEY`,
   `DROPBOX_APP_SECRET`, and the existing `RECAP_STORAGE_ENCRYPTION_KEY`.
   Do not commit keys, and do not reuse a user OAuth key as the site app key.
5. Redeploy after the secrets are configured, then connect from Account > Dropbox Storage.
   The Dropbox Connect button is disabled until the site is configured.

## Workflow

- GMs select any connected Drive or Dropbox account in the existing recap audio uploader.
- Dropbox uses an explicit OAuth code flow with offline access and AES-GCM encrypted
  refresh token bound to the user and connection ID.
- Upload uses Dropbox sequential upload sessions, an authenticated same-origin TWE
  relay, 8 MiB chunks, and server-side finish/metadata checks.
- Files are created under `Tales Without End/Session Audio`, with an asset UUID
  in the filename so a lost browser receipt can be recovered without re-upload.
- Playback streams through the authorized campaign recap endpoint with Range support;
  no Dropbox OAuth tokens, URLs or stored file IDs are exposed to players.
- Disconnect locally removes credentials and attempts to revoke Dropbox access;
  files are not deleted.

## Limitations and operations

- TWE cannot configure a Dropbox API app or Cloudflare secrets on behalf of the owner.
- A long audio upload keeps the browser tab open. A network error mid-session
  may require a new upload; if the upload finished, try **Find saved recording**
  before sending the file again.
- This adds **original session audio storage** only. AI processing still uses
  the existing transcription/summary providers and preparation pipeline.
- Verify with a real Dropbox OAuth login, a small test audio upload, resume/seek
  playback, and then a representative long recording. CI cannot verify private
  Dropbox credentials or actual account quotas.
