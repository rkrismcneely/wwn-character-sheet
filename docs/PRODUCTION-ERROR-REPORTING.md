# Production error reporting

Tales Without End uses Cloudflare Workers Logs for compact production diagnostics. It does not send application errors to a third-party error-reporting vendor and does not create a dedicated error-report database.

## What is collected

Server error events may contain:

- event type/version
- sanitized route template with dynamic identifiers replaced
- HTTP method and status for failed responses
- generic error class/name
- opaque truncated SHA-256 fingerprint derived from error type and stack shape
- Cloudflare Ray ID when present
- a small internal category such as `uncaught-exception` or `live-session-response`

Client error events may contain:

- event type/version
- `window-error`, `unhandled-rejection`, or `react-boundary`
- sanitized route template with dynamic identifiers replaced
- generic error class/name
- opaque truncated SHA-256 fingerprint derived locally from error type and stack shape
- same-origin JavaScript asset path plus line/column when the browser provides them
- Cloudflare Ray ID for the reporting request when present

Client reports are capped at five distinct reports per page load and de-duplicated by fingerprint where possible.

## What is deliberately excluded

Do not add any of the following to structured error events:

- character sheets, character names, notes, inventory, spells, or other character state
- campaign names, descriptions, notes, maps, handouts, NPC content, store content, or other campaign state
- request or response bodies
- query strings or URL fragments
- raw error messages
- raw stack traces
- cookies, OAuth tokens, authorization headers, or session identifiers
- email addresses, usernames, user IDs, character IDs, campaign IDs, invite IDs, or other application object identifiers
- IP addresses or user-agent strings as custom fields

The client reporting request uses `credentials: "omit"`. The receiver accepts only a fixed compact JSON schema and normalizes it again server-side before logging.

## Storage, retention, and access

Logs are stored only in the Cloudflare account's Workers observability system and follow the retention period Cloudflare provides for the active account/plan. Broad invocation logging is disabled; explicit Tales Without End error events remain enabled.

Access is limited to people who already have permission to view the Tales Without End Cloudflare Worker logs. Do not export logs into another persistent system without revisiting this privacy policy first.

## Operational use

Search Workers Logs for:

- `twe_server_error`
- `twe_client_error`

Use `fingerprint`, sanitized `route`, error category/name, status, source asset and Cloudflare Ray ID to correlate repeated failures. A fingerprint is diagnostic grouping only; it must not be treated as a user identity.

When more detail is needed, reproduce the issue in development or add a narrowly scoped safe diagnostic field. Do not respond by logging request bodies or user-created content.

## Review rule

Any future change that expands the collected fields, changes retention, adds a third-party processor, or introduces persistent error storage requires an explicit privacy review before deployment.
