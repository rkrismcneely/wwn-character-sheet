# Enable each GM's own Google Drive storage connection

**Status:** OAuth integration code is implemented; setup requires an existing or dedicated Google OAuth client, the Drive API, an authorized callback URI, and one encryption secret. This setup does not require a paid Google Cloud project. Drive upload and playback are implemented, but are disabled until OAuth setup and each GM's separate Drive consent are complete.

## One-time operator setup (no subscription)

1. In **Google Cloud Console → Google Auth Platform / Clients**, use TWE's already configured Google sign-in Web application OAuth client, or create an optional **dedicated Web application OAuth client** for Drive. Enable the Google Drive API in that project. Set the authorized redirect URI **exactly** to:
   `https://taleswithoutend.com/api/account/storage/google-drive/callback`
2. Configure the OAuth consent screen for external users. TWE requests **only** `https://www.googleapis.com/auth/drive.file` and needs `access_type=offline`. The `drive.file` scope is non-sensitive, but Google still has consent/verification requirements. Testing-mode refresh tokens can expire after seven days; move through Google's appropriate production publishing process before considering it a dependable persistent connection.
3. Set these Worker secrets:
   - `GOOGLE_DRIVE_CLIENT_ID` — optional separate Drive OAuth client ID (otherwise uses TWE's configured `GOOGLE_CLIENT_ID`)
   - `GOOGLE_DRIVE_CLIENT_SECRET` — optional matching Drive client secret (otherwise uses TWE's configured `GOOGLE_CLIENT_SECRET`)
   - **Both** dedicated client settings must be present if using an override; an incomplete override fails closed.
   - `RECAP_STORAGE_ENCRYPTION_KEY` — independent **32 cryptographically random bytes**, encoded using unpadded base64url (43 characters). Generate with a cryptographically secure random generator; never commit this secret or a generated value to GitHub. Keep an offline backup: rotation without a migration will make existing encrypted Drive grants inaccessible.
4. Cloudflare Worker secrets must be present on the **production** worker. The code will report storage as unavailable until they are configured. Do not automatically create or charge for any external accounts or services.
5. The GitHub "Migrate and Deploy Session Recaps" workflow applies `0036_recap_storage_oauth_states.sql` before deploying the routes. Confirm the migration succeeded, then verify **Account → Storage → Connect Google Drive**.

## How it works

- Account page loads only redacted connection status for the signed-in owner, not tokens, refresh tokens, remote IDs or other GMs' accounts.
- Clicking Connect starts Google's consent flow with the dedicated client, a cryptographically random state, and a short-lived HttpOnly/Secure/SameSite=Lax browser cookie. TWE stores only a SHA-256 hash of the state in D1 and consumes it **once**, scoped to the current TWE user.
- Google must return an offline refresh token and exactly the required `drive.file` scope among granted scopes. TWE verifies the Drive account through Google's own API.
- TWE encrypts the refresh credential with AES-256-GCM, a fresh nonce and owner/provider/connection authenticated associated data. Only the encrypted credential is stored in the private D1 connection record. The encryption key is a Worker secret outside source control.
- Disconnect clears local ciphertext immediately and makes dependent recordings inaccessible for TWE playback until reconnected. It attempts provider revocation without preventing a local disconnect if Google is unreachable. It **never deletes a GM's Google Drive files**.
- Google sign-in and Google Drive connect are **two different permissions**. Linking Google authentication to TWE does not authorize Drive storage.
- A GM's Drive connection belongs only to their individual TWE account, not the campaign; a player will ultimately stream permitted audio through a separately authorized route without receiving the owner's Google credentials.

## Known boundaries and next phases

- Existing GM Drive uploads and authorized recap playback are implemented. Selecting arbitrary existing Drive files is not supported. Direct AI Recap Only generation remains under development.
- A connected grant's `drive.file` scope covers files created/opened using TWE's app and files explicitly chosen with an appropriate picker; it does **not** allow browsing all Drive files without permission.
- Large session recording upload should stream directly from the GM's browser to Drive with resumable uploads, not relay all bytes through Cloudflare.
- Playback may use authenticated byte-range streaming, but must be tested against Drive traffic restrictions and site-owner free hosting limits before rollout.
- A revoked, expired, or disconnected token requires GM reconnection. No fallback to a TWE-owned storage account.
- Current OAuth uses a 10-minute state and fails closed on missing settings. Run full real-Google connection/reconnection/revocation checks before claiming general availability.

Official references:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2
