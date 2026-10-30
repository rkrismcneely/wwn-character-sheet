# Browser-to-GM-Drive resumable audio upload protocol

The helper at `lib/campaigns/recap-drive-upload-browser.ts` sends recording slices **directly from the GM's browser to a Google Drive upload session URL**. It does not send audio bodies to TWE's Worker or store them in R2.

- Typical 2–3-hour audio files are supported up to 4 GiB (while sessions planned in TWE remain bounded at 8h).
- Each upload chunk is 8 MiB by default, aligned to the 256 KiB multiple required by Google.
- A lost response triggers an empty PUT query to Drive for the actual acknowledged offset. It does **not** guess progress or resend an unknown portion.
- A URL returned by the Drive session initializer is validated for the expected HTTPS Google upload host and path. **Session URLs are temporary bearer capabilities and must be delivered only to the authorized GM, never to players or logs.**
- Google upload session URLs normally last one week. This implementation resumes network interruptions **while the browser remains open**. Resuming after browser closure and the server-side start/verify endpoints are **not implemented yet**.
- No OAuth refresh token or other secret is sent to the client. The temporary Drive upload session URL is the only upload capability.
- Browser-to-Google cross-origin uploads must be verified with a real account, especially Safari/iOS. Fail rather than proxy large audio through a paid TWE hosting path.

Next step: a GM-authorized server endpoint starts a Drive upload session using **their** OAuth refresh token, writes an unready TWE audio reference, and after the browser finishes, verifies the remote file's owner and appProperties before marking it ready. After that, add a visible uploader to the Session Recap editor.

Reference: https://developers.google.com/workspace/drive/api/guides/manage-uploads
