# Session Recaps — each GM brings their own AI providers

Status: design and typed provider preferences only. **No provider credentials are accepted or stored yet; no account connection or audio/text inference is activated by this change.**

## Goal

Each TWE GM connects accounts they personally own. TWE has **no shared AI API key or shared AI quota**. A connected account belongs to the individual TWE user, may be reused across their campaigns, and may only be used when that GM deliberately starts a job. A co-GM cannot spend another GM's quota merely because they share a campaign.

The GM independently selects:
- **Speech-to-text**: Groq Whisper using the GM's own key, or local Whisper running on their device. Gemini audio transcription remains experimental and is not an enabled transcription choice until real timestamp quality and account behavior are tested.
- **Recap writer**: Groq text model, Gemini text model, or manual editing without an AI provider.
- **Audio preparation**: locally in the browser, based on the existing Craig raw.dat/Minizel decoding investigation.
- **Storage**: short-lived server-owned R2 with limits by default; optional personal Google Drive is a separate later feature with its own consent/scopes.

## How connection works

| Provider | Intended connection | Scope | Current status |
| --- | --- | --- | --- |
| GroqCloud | GM creates an API key at https://console.groq.com/keys and pastes it in a protected TWE setup flow | Whisper audio / text generation, per supported Groq models | Catalog only |
| Gemini API | GM creates an API key in https://aistudio.google.com/api-keys | Recap generation on the GM's own Google AI Studio project | Catalog only |
| Local Whisper | No account, download a compatible local model on demand | Speech transcription on supported browsers/devices | Catalog only |
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

## Strict $0 requirement and its unavoidable limitation

The application will not purchase services, attach a TWE billing account, enable a paid fallback or automatically upgrade a provider. The options default to `freeOnly:true` and `fallback:"pause"`.

**A user-supplied API key does not prove its account is free or not linked to billing.** Some providers automatically bill a user when their billing-enabled account exceeds included credits. TWE cannot promise that every bring-your-own-key invocation is free unless provider documentation and an authoritative free-tier/usage endpoint allow us to verify it. Until then, do not enable inference with keys that lack enforceable no-charge protection. Let users choose fully local/manual processing if they require an absolute no-billing guarantee.

Groq's free-tier transcription upload maximum is 25 MB per request, and its limits are at organization level. Gemini model quotas are project-level and are viewable in AI Studio. Plan 2–3-hour Craig sessions with resumable chunks and explicit per-user progress.

## Future UI (not implemented in catalog PR)

**Account Settings → Session Recap Providers** lists provider tiles with Connect/Test/Disconnect, eligible capabilities, privacy notes, model choices and real free-tier status where verifiable. The GM then chooses speech-to-text and recap writer independently in **Campaign → Session Recap → Generate**; defaults come from their personal account. Prefer no more controls than necessary.

A future `ProviderAdapter` must normalize `transcribeChunk` and `generateRecap` outputs, timestamps and error codes. `connectionMethod` is metadata: provider-specific adapter and encryption code must be reviewed independently before users can connect.

Useful docs:
- Groq speech API: https://console.groq.com/docs/speech-to-text
- Groq limits: https://console.groq.com/docs/rate-limits
- Gemini API keys: https://ai.google.dev/gemini-api/docs/api-key
- Gemini free/premium billing: https://ai.google.dev/gemini-api/docs/billing
- Gemini project limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
