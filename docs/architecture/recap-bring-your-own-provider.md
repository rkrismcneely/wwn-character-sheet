# Session Recaps — each GM brings their own AI providers

Status: design and typed provider preferences only. **No provider credentials are accepted or stored yet; no account connection or audio/text inference is activated by this change.**

## Goal

Each TWE GM connects accounts they personally own, **whether free or paid by that GM**. TWE has **no shared AI API key, shared AI quota, or site-owner-funded provider subscription**. A connected account belongs to the individual TWE user, may be reused across their campaigns, and may only be used when that GM deliberately starts a job. A co-GM cannot spend another GM's quota merely because they share a campaign.

The GM independently selects:
- **Speech-to-text**: Groq Whisper using the GM's own key, or local Whisper running on their device. Gemini audio transcription remains experimental and is not an enabled transcription choice until real timestamp quality and account behavior are tested.
- **Recap writer**: Groq text model, Gemini text model, or manual editing without an AI provider.
- **Audio preparation**: locally in the browser, based on the existing Craig raw.dat/Minizel decoding investigation.
- **Storage and recap playback**: GM-owned Google Drive is the initial target, with Dropbox/OneDrive adapters planned. Recordings must play inside authorized Session Recap pages with timestamps; R2 is at most temporary processing storage. This is a core requirement; see [user-owned audio storage design](recap-user-owned-audio-storage.md).

## How connection works

| Provider | Intended connection | Scope | Current status |
| --- | --- | --- | --- |
| GroqCloud | GM creates an API key at https://console.groq.com/keys and pastes it in a protected TWE setup flow | Whisper audio / text generation, per supported Groq models | Catalog only |
| Gemini API | GM creates an API key in https://aistudio.google.com/api-keys | Recap generation on the GM's own Google AI Studio project | Catalog only |
| Craig supporter transcripts | GM purchases Tier 3 directly from Craig if they wish, then imports WebVTT/SRT into TWE; no TWE Craig subscription | No audio transcription is run by TWE for this path | Catalog only; import UI and parser not implemented |\n| Local Whisper | No account, download a compatible local model on demand | Speech transcription on supported browsers/devices | Catalog only |
| Manual | No account | Hand-write/edit session recap | Already supported |

TWE's existing **Google account sign-in does not authorize calls to Gemini API or Google Drive**. Where a service offers a usable, correctly scoped consumer OAuth flow, implement it independently. Do not label arbitrary API-key collection as an OAuth connection.

## Secrets and authorization requirements before enabling a Connect button

1. Encrypt each user-owned API token **server-side** using authenticated encryption (AES-256-GCM with a separate app-level encryption secret, per-record nonce and associated data identifying user + provider). Store ciphertext only. Never put tokens in source, R2 metadata, logs, telemetry or JSON responses.
2. Only authenticated **owner** may create, replace, verify, or revoke their own credential; do not permit admins, other GMs or campaign collaborators to view the plaintext.
3. TWE backend makes provider API calls to allowlisted domains; never reveal API keys in client-side JS or browser storage. Restrict API keys to the minimum provider permissions when supported.
4. Per-provider credential fingerprint, `connected / needs-attention / revoked` status, and a Test Connection action that makes a bounded, explicitly consented test call. Do not claim a connection is active just because a key was saved.
5. Deleting a connection must stop future jobs using it; cancel or pause queued runs and delete encrypted material safely. Include key rotation and clear audit messages that reveal no secrets.
6. Explicit privacy and retention disclosures; remote providers receive audio or text under **their** terms, independent from TWE. Do not share data across providers by default.
7. Never share quotas or switch provider accounts automatically. If the chosen provider returns `429`, authentication failure, billing/quota exhaustion or unavailable model, pause the job and show why.

## Site-owner $0 constraint versus GM-owned spending

**Only the TWE operator must have zero ongoing service bills.** TWE never funds AI inference, upgrades a provider plan, provisions a paid Cloudflare Container, stores a site-owner API key for public use, or collects service subscription payments on behalf of a provider.

**GMs may voluntarily pay their own provider**, such as a Groq paid API plan, Gemini billed API project, or Craig Tier 3 supporter subscription. Their existing subscriptions should be reusable. TWE must not block such access solely because it is paid.

Provider preferences have an explicit `billingMode`: `provider-free-only` (GM requests only their provider's free quota, if enforceable) or `gm-owned-paid-allowed` (GM explicitly accepts their provider's charges). Either mode retains `fallback:"pause"` to prevent changing provider accounts without the GM's consent. **No automatic account upgrade or TWE-paid fallback**.

Account-level charges are assessed under the GM's external provider agreement. A personal API key may belong to a billing-enabled project; TWE cannot independently guarantee it is free, nor always query an exact balance. Before sending paid-capable requests, show provider, account, model, predicted usage/cost where available, and let the GM set a per-job limit. Estimates are not a substitute for hard provider-side billing caps.

A Craig Tier 3 GM can download a timestamped VTT or SRT transcription directly from Craig. TWE's **timed-captions** pipeline should accept these transcripts and avoid spending transcription tokens entirely. Importing does not require an OAuth integration with Craig or access to the GM's Patreon account. Plain TXT can support recap generation but may lack speech timing or reliable speaker cues; do not invent them.

**The TWE infrastructure itself remains bounded by its free plan** (hosting, D1, R2, and network processing) regardless of GMs' external account tiers. Implement local/browser processing, storage limits and graceful pauses instead of paying for usage above platform free allowances.

Groq's free-tier transcription upload maximum is 25 MB per request, and its limits are at organization level; paid organizations may have other limits. Gemini quotas are project-level. Plan 2–3-hour Craig sessions with resumable chunks and per-GM job progress.

## Future UI (not implemented in catalog PR)

**Account Settings → Session Recap Providers** lists provider tiles with Connect/Test/Disconnect, eligible capabilities, privacy notes, model choices, and whether the GM elects to use their own paid plan. The GM then chooses speech-to-text and recap writer independently in **Campaign → Session Recap → Generate**; defaults come from their personal account. Prefer no more controls than necessary.

A future `ProviderAdapter` must normalize `transcribeChunk` and `generateRecap` outputs, timestamps and error codes. `connectionMethod` is metadata: provider-specific adapter and encryption code must be reviewed independently before users can connect.

Useful docs:
- Groq speech API: https://console.groq.com/docs/speech-to-text
- Groq limits: https://console.groq.com/docs/rate-limits
- Gemini API keys: https://ai.google.dev/gemini-api/docs/api-key
- Gemini free/premium billing: https://ai.google.dev/gemini-api/docs/billing
- Gemini project limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Craig Tier 3 transcription: https://craig.chat/supporter/\n- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
