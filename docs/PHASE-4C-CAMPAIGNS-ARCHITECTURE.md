# Phase 4C architecture — Campaigns and sharing

_Status: design only. Audited against current `main` on 2026-08-15. This document
does not add campaign tables, routes, UI, migrations, or production changes._

## Decision summary

Build a private, member-scoped campaign layer beside—not inside—the existing character
ownership and global visibility model.

- Campaigns receive opaque `cmp_` public IDs for URLs and retain a separate internal
  primary key.
- A campaign has one owner and two membership roles: `gm` and `player`.
- Campaign membership grants read-only access to characters explicitly linked to that
  campaign; it never transfers ownership or broadens a character's global visibility.
- Links remain many-to-many across campaigns, while the private-campaign MVP permits at most one linked character per member in each campaign.
- Invitations are authenticated, single-use, expiring capability links. Only a hash is
  stored.
- The first release has private campaigns only. Public or guest view-only campaign
  links are a later, explicitly designed capability.

This matches the current product's central safety rules: stable opaque character URLs,
owner-only mutation, private/unlisted/public global visibility, secure one-time claim
tokens, and site-admin read-only access.

## Current architecture relevant to campaigns

### Accounts and authorization

Better Auth provides D1-backed Google sessions. The request-scoped
`getSessionActor(request)` helper exposes only `userId` and a normalized `user` or
`admin` role to application routes. The current admin role is deliberately read-only:
an administrator may read any character but cannot mutate another user's character.

New campaign routes must use the same request-scoped actor helper. They must not read
raw session data, construct Better Auth at module scope, or invent a second role model.

### Characters

Each character has:

- an internal UUID primary key;
- an opaque, stable `chr_` public ID used by direct routes;
- a nullable owner user ID;
- global `private`, `unlisted`, or `public` visibility;
- optimistic versioning and owner-only mutations.

The current character authorizer grants reads to the owner, a site administrator, and
global public/unlisted viewers. It intentionally hides inaccessible private records as
not found. Imports always create a fresh private, owner-owned record. Legacy claims
securely move an unowned record to a claimant; they are not a general sharing mechanism.

Campaigns must add a *scoped* read grant for an attached character and active campaign
membership. They must not change `owner_user_id`, character visibility, public IDs,
export rules, claim rules, or the existing direct `/character/chr_...` behavior.

### APIs and runtime

Current authenticated API routes obtain D1 through the Cloudflare binding, use bounded
JSON parsing, and centralize character payloads/authorization in the character API
helpers. Owner mutations use both authorization checks and ownership-constrained D1
writes. Local built-Worker/runtime tests already seed temporary D1 users, sessions, and
characters; that is the right pattern for campaign authorization tests.

There is no campaign API or table on current `main`.

### UI

Signed-out `/` is the landing page. Signed-in `/` is the My Characters dashboard.
The dashboard already groups owner actions: create, import, legacy claim, public browse,
and sign out. Public Characters is a separate archive. The character sheet is a large,
mature surface with a character-library modal, visibility controls, and a clear
read-only state for non-owners/admins.

Campaign navigation should begin on the dashboard, not by adding a second primary
workflow inside the character sheet. A later compact owner-only campaign affiliation
control can be added where it fits the existing sharing area.

## Recommended data model

Use four additive D1 tables. IDs below are text UUIDs unless noted.

### `campaigns`

| Field | Purpose |
| --- | --- |
| `id` (PK) | Internal campaign identity for joins. |
| `public_id` (unique) | Opaque `cmp_` ID for URLs; generated from at least 128 bits of randomness. |
| `owner_user_id` (FK to Better Auth user) | The sole campaign owner and initial GM. |
| `name` | Campaign display name, bounded and sanitized as ordinary application text. |
| `description` (nullable) | Optional bounded campaign description. |
| `version` | Optimistic version for campaign settings updates. |
| `created_at`, `updated_at` | Audit/order fields. |

Indexes: unique `public_id`; `(owner_user_id, updated_at)` for My Campaigns. Use a
restrictive owner deletion policy rather than silently creating ownerless campaigns.
Account-deletion handling/ownership transfer is not in the MVP.

Do not add public visibility, guest sharing, maps, notes, or VTT state here.

### `campaign_members`

| Field | Purpose |
| --- | --- |
| `campaign_id` (FK, cascade on campaign delete) | Campaign membership. |
| `user_id` (FK) | Better Auth user. |
| `role` | `gm` or `player`, enforced by a check constraint. |
| `joined_at` | Membership timing. |

Primary key: `(campaign_id, user_id)`. Index `(user_id, joined_at)` powers the
signed-in campaign list. On campaign creation, atomically insert the campaign plus the
owner's `gm` membership.

A second GM can be supported by the same role column later without inventing another
table. The campaign owner remains the only person who can delete the campaign or make
destructive ownership-level changes in the MVP.

### `campaign_characters`

| Field | Purpose |
| --- | --- |
| `campaign_id` (FK, cascade) | Campaign. |
| `character_id` (FK, cascade) | Existing character's internal ID. |
| `added_at` | Link ordering/audit. |

Primary key: `(campaign_id, character_id)`; add an index on `character_id` for
showing a character's campaign affiliations. The MVP's one-character-per-member rule is
enforced by server-side conditional writes that join the linked character back to its
owner; the same character may still join multiple campaigns.

This is deliberately a many-to-many join table. There is no `campaign_id` column on
`characters`, no character backfill, and no duplicate owner field. Application
authorization enforces that only an active campaign member may attach a character they
own.

### `campaign_invites`

| Field | Purpose |
| --- | --- |
| `id` (PK) | Internal invite record. |
| `campaign_id` (FK, cascade) | Invited campaign. |
| `token_hash` (unique) | Hash of the generated invite secret; never store the raw token. |
| `role` | Initially constrained to `player`. |
| `created_by_user_id` | Audits the GM who created it. |
| `created_at`, `expires_at` | Expiring capability lifecycle. |
| `accepted_at`, `accepted_by_user_id` | One-time redemption record. |
| `revoked_at` | Explicit invalidation. |

Index the token hash uniquely and add a campaign/status index suitable for displaying
active/revoked/accepted invite metadata to authorized GMs. Generate a distinct opaque
invite token (for example `cminv_` plus 256 bits of randomness), store a SHA-256 hash,
and show the raw token only once. Do not send or store email addresses in this MVP.

## Permission model

A “campaign character read” is valid only when the character is linked to that campaign
and the request is evaluated in that campaign context. It is not a new global character
visibility state.

| Action | Visitor | Signed-in outsider | Player member | GM / campaign owner | Site admin |
| --- | --- | --- | --- | --- | --- |
| View a private campaign or its roster | No | No | Yes | Yes | Yes, read-only |
| Accept a valid invite | Must sign in | Yes; becomes player | N/A | N/A | Only as an ordinary authenticated user, not by admin override |
| Leave campaign | No | No | Yes | Owner cannot leave while owner | No override |
| Create/revoke player invite | No | No | No | Yes | No |
| Remove a player | No | No | No | Yes; never remove sole owner | No |
| Attach/detach own character | No | No | Yes | Yes for own character | No |
| View a linked member character through campaign | No | No | Yes, read-only unless owner | Yes, read-only unless owner | Yes, read-only |
| Edit/delete a character | No | No | Only own character | Only own character | Only admin-owned character |
| Update campaign settings | No | No | No | Owner only in MVP | No |
| Delete campaign | No | No | No | Owner only | No |

Campaign GM is a membership role; campaign ownership is an additional single-owner
property. The MVP may expose only the creator as the GM/owner in the UI while retaining
the `gm` role for a later multi-GM promotion flow. If multiple GMs are exposed, they
can invite/revoke invitations and remove players, but owner-only destructive settings
and deletion remain unchanged.

Use 404-style responses for private campaigns/links that the caller cannot view, to
avoid campaign enumeration. Site-admin campaign read access follows the existing
site-admin global read-only principle and must expose no write capability or raw invite
tokens.

## Membership and invite flow

1. An authenticated owner creates a private campaign. The service atomically creates
   owner + `gm` membership.
2. The owner/GM creates a one-use player invite with a short expiry (seven days is a
   sensible initial default). The UI displays/copies the token once.
3. A recipient signs in and previews the invite without consuming it, selects exactly one
   owned character, then confirms. The service atomically verifies the hash, expiry,
   revocation state, unused state, and character ownership; records acceptance; inserts
   one player membership row; and links only the selected character.
4. Replays, expiry, revocation, or a pre-existing membership return a safe generic
   outcome and create no extra membership.
5. A player may leave. A GM may remove a player. The operation removes that user's
   character links for this campaign in the same transaction/batch.
6. The owner cannot be removed or leave without an explicit future ownership-transfer
   workflow. Do not silently orphan a campaign.

A reusable public join code, email delivery, invite-to-GM, and ownership transfer are
later enhancements, not requirements for the first useful release.

## Character linking and access

- Only a character's owner can attach or detach it.
- The owner must be an active member of the target campaign.
- Each member may link at most one owned character to a particular campaign; an owner/GM
  may remain a member with no linked character.
- A character can appear in multiple campaigns.
- Linking does not modify `owner_user_id`, visibility, public ID, exported data, or
  legacy-claim state.
- An unowned legacy character is not attachable until a user claims it.
- Campaign members and GMs can read linked characters within the campaign. They do not
  gain edit, delete, export, portrait, visibility, or re-link rights.
- Existing direct `/character/chr_...` routes keep their exact current visibility
  rules. Campaign membership alone should not make a copied direct character URL work.

Use campaign-scoped routes such as
`/campaign/cmp_.../characters/chr_...` and matching API access checks. This makes the
additional read grant explicit, permits immediate revocation when the link or membership
is removed, and avoids accidentally broadening global direct-character access. Reuse the
existing character-sheet read-only presentation and payload shape where possible, with
an explicit campaign-read-only permission flag.

The campaign page should display a shared library of attached character summaries, not
a new public archive. It must not include user email addresses, internal user IDs, OAuth
data, sessions, or invite secrets.

## Sharing boundary

The MVP is **private campaigns with member sharing only**. Existing public/unlisted
character visibility remains the appropriate global sharing choice.

Do not add public campaign pages or a guest “view-only campaign” URL in the first
release. Those features need a separate product decision about whether a guest can see
the roster, which linked characters are included, expiration/revocation, and how private
character owners consent. If later needed, model them as revocable, expiring,
hash-only capability records (for example `campaign_shares`), rather than a boolean
that makes every attached character public.

## Migration and rollout

Use one additive migration after the current sequence:

1. Create the four campaign tables, foreign keys, checks, unique constraints, and
   indexes.
2. Update the typed schema and migration tests; do not alter `characters`.
3. Apply the reviewed migration through the existing guarded production migration
   workflow before deploying code that requires the tables.
4. Deploy API/UI code. Empty tables are a valid state; existing users and characters
   require no backfill.

The tables begin empty, so this has no character data rewrite and no required downtime
beyond the normal D1 migration operation. Production deployment must not create an
implicit campaign or attach an existing character.

## MVP boundary

### Required for the first useful campaign release

- Private campaign creation and My Campaigns dashboard entry.
- Owner/GM and player membership roles.
- Single-use, expiring, hash-only player invitation acceptance.
- Member roster, leave/removal, and invitation revocation.
- Owner-controlled linking of one owned character per member per campaign, while allowing
  the same character to participate in multiple campaigns.
- Private shared campaign character library.
- Campaign-scoped read-only viewing of other members' linked characters.
- Server-side authorization tests and local built-Worker coverage.

### Later campaign/VTT work

- Multiple-GM management and ownership transfer.
- Guest/public campaign sharing links.
- Campaign images, notes, handouts, maps, scenes, combat, initiative, chat, dice
  history, real-time synchronization, and token state.
- Per-character campaign notes or campaign-specific overrides.
- Reusable invite links/email delivery and richer membership audit UI.
- Campaign search/discovery, public listings, and notifications.

## Implementation sequence

### PR 1 — schema and policy foundation

Add the additive migration, typed schema entries, opaque campaign/invite ID helpers, and
pure campaign authorization/domain helpers. Add migration/constraint tests. No user
surface or production migration execution in this PR.

### PR 2 — private campaigns and membership

Add campaign create/list/read/settings APIs and the dashboard's My Campaigns entry.
Create initial owner membership, member roster, and owner/GM authorization. Extend local
built-Worker tests with synthetic owner, player, outsider, and site-admin actors.

### PR 3 — invitations

Add hash-only invite creation, copy-once UI, authenticated acceptance, expiration,
single-use/revoke behavior, leave/removal cleanup, and authorization tests. Keep invite
tokens out of logs, responses after creation, and list payloads.

### PR 4 — character links and campaign-scoped viewing

Add owner-only attach/detach, campaign library APIs, campaign-specific character routes,
and read-only reuse of the existing sheet. Test that global visibility/direct routes
remain unchanged and that membership/link removal immediately removes campaign access.

### PR 5 — polish and browser smoke extensions

Add responsive/accessibility polish and, once the Playwright foundation is merged,
small seeded session smoke flows for campaign create/join/view and outsider denial.
Keep it separate from maps, combat, or other VTT features.

Each stage is independently testable and avoids coupling an unreviewed data migration to
a large UI redesign.

## Required tests

### Unit/domain

- Opaque ID format and invite token hashing; raw tokens are never persisted.
- Role and ownership policy matrix, including admin read-only behavior.
- Invite expiry, revocation, one-time acceptance, duplicate membership, and concurrent
  acceptance handling.
- Attach eligibility: owner + active membership only; one linked character per member in
  each campaign; a character can link to multiple campaigns.

### API and local Worker/runtime

- Unauthenticated and outsider campaign/roster/library access is denied without
  enumeration.
- Player can read only their campaign's roster and linked library.
- GM can manage members/invites but cannot mutate another user's character.
- Campaign owner can change settings/delete; players cannot.
- Membership removal/leave removes that user's links for that campaign.
- A linked private character is readable only through an active campaign context; its
  direct character URL remains private.
- Detaching a character or revoking membership removes campaign-scoped access.
- Public/unlisted behavior, imports, claims, portrait authorization, and existing
  owner/admin mutation rules remain unchanged.
- Site admin receives read-only campaign/character access and no campaign write
  override.
- API payloads never expose emails, internal account IDs, sessions, OAuth values, raw
  invitation tokens, or SQL parameters.

### Browser smoke additions

After the current Playwright foundation is merged, add deterministic local fixtures for
a campaign owner, player, outsider, admin, and linked characters. Cover dashboard
campaign navigation, invited player acceptance, campaign character read-only viewing,
outsider denial, owner edit versus non-owner read-only state, and one narrow mobile
navigation check. Do not automate Google OAuth or use production credentials/data.

## Risks and decisions to keep explicit

- **No email delivery exists.** Use one-use copyable invite tokens rather than adding an
  email service.
- **Global URLs remain global.** Campaign membership is intentionally not evaluated on
  direct character routes; campaign routes make the additional grant revocable.
- **Owner lifecycle needs a future policy.** The MVP restricts owner removal/leave;
  ownership transfer is deferred.
- **Admin visibility is read-only.** Campaign access must not become an admin write
  escape hatch.
- **Private means private outside the campaign.** UI copy must explain that campaign
  sharing is an additional controlled audience, not a visibility change.
- **Do not place campaign state in character JSON.** It would pollute export/import,
  complicate multi-campaign membership, and weaken relational authorization.
- **Do not log capability tokens.** Treat campaign invite tokens with the same handling
  standard as legacy claim tokens.

## Recommended first implementation task

Start with **PR 1: additive campaign schema plus pure authorization/domain tests**. It is
the smallest safe foundation: it introduces no campaign UI or production data changes,
locks the permission model before routes exist, requires no character backfill, and makes
later dashboard/invite work straightforward to test.
