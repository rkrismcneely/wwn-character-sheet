import type { CharacterActor } from "./authorization";
import {
  hashLegacyClaimToken,
  isPlausibleLegacyClaimToken,
} from "./identifiers.ts";

interface ClaimStatusRow {
  id: string;
  expiresAt: string;
  claimedAt: string | null;
  revokedAt: string | null;
  itemCount: number;
  ownedCount: number;
  missingPublicIdCount: number;
}

interface ClaimedCharacterRow {
  publicId: string;
  name: string;
}

export class LegacyClaimError extends Error {
  public readonly status: 400 | 404 | 409;

  constructor(
    message: string,
    status: 400 | 404 | 409,
  ) {
    super(message);
    this.status = status;
  }
}

export async function claimLegacyCharacters(
  db: D1Database,
  actor: CharacterActor,
  token: string,
  now = new Date(),
): Promise<ClaimedCharacterRow[]> {
  if (!isPlausibleLegacyClaimToken(token)) {
    throw new LegacyClaimError("Invalid claim token.", 400);
  }
  const tokenHash = await hashLegacyClaimToken(token);
  const nowText = now.toISOString();
  const status = await db
    .prepare(
      `SELECT claim.id,
              claim.expires_at AS expiresAt,
              claim.claimed_at AS claimedAt,
              claim.revoked_at AS revokedAt,
              count(item.character_id) AS itemCount,
              sum(CASE WHEN character.owner_user_id IS NULL THEN 0 ELSE 1 END) AS ownedCount,
              sum(CASE WHEN character.public_id IS NULL THEN 1 ELSE 0 END) AS missingPublicIdCount
       FROM legacy_character_claims AS claim
       JOIN legacy_character_claim_items AS item ON item.claim_id = claim.id
       JOIN characters AS character ON character.id = item.character_id
       WHERE claim.token_hash = ?
       GROUP BY claim.id`,
    )
    .bind(tokenHash)
    .first<ClaimStatusRow>();

  if (!status || status.revokedAt || status.expiresAt <= nowText) {
    throw new LegacyClaimError("Claim token not found or expired.", 404);
  }
  if (status.claimedAt) {
    throw new LegacyClaimError("This claim token has already been used.", 409);
  }
  if (Number(status.itemCount) < 1 || Number(status.ownedCount) > 0) {
    throw new LegacyClaimError("The selected character is no longer claimable.", 409);
  }
  if (Number(status.missingPublicIdCount) > 0) {
    throw new LegacyClaimError("The selected character is not ready to claim.", 409);
  }

  const results = await db.batch([
    db
      .prepare(
        `UPDATE legacy_character_claims
         SET claimed_at = ?, claimed_by_user_id = ?
         WHERE id = ? AND token_hash = ?
           AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
           AND NOT EXISTS (
             SELECT 1
             FROM legacy_character_claim_items AS item
             JOIN characters AS character ON character.id = item.character_id
             WHERE item.claim_id = legacy_character_claims.id
               AND character.owner_user_id IS NOT NULL
           )`,
      )
      .bind(nowText, actor.userId, status.id, tokenHash, nowText),
    db
      .prepare(
        `UPDATE characters
         SET owner_user_id = ?
         WHERE owner_user_id IS NULL
           AND id IN (
             SELECT item.character_id
             FROM legacy_character_claim_items AS item
             JOIN legacy_character_claims AS claim ON claim.id = item.claim_id
             WHERE claim.id = ? AND claim.token_hash = ?
               AND claim.claimed_by_user_id = ? AND claim.claimed_at = ?
           )`,
      )
      .bind(actor.userId, status.id, tokenHash, actor.userId, nowText),
  ]);

  if (results[0]?.meta.changes !== 1) {
    throw new LegacyClaimError("This claim token has already been used.", 409);
  }
  if (results[1]?.meta.changes !== Number(status.itemCount)) {
    throw new LegacyClaimError("The selected character could not be claimed.", 409);
  }

  const claimed = await db
    .prepare(
      `SELECT character.public_id AS publicId, character.name
       FROM characters AS character
       JOIN legacy_character_claim_items AS item ON item.character_id = character.id
       WHERE item.claim_id = ? AND character.owner_user_id = ?
       ORDER BY character.name`,
    )
    .bind(status.id, actor.userId)
    .all<ClaimedCharacterRow>();
  return claimed.results;
}
