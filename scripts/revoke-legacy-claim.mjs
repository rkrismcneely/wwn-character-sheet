import {
  executeD1,
  operationMode,
  optionValue,
  queryD1,
  sqlText,
} from "./d1-admin.mjs";

const claimId = optionValue("--claim-id");
if (!claimId) throw new Error("Provide --claim-id=<claim-id>.");
const { remote, apply } = operationMode();
const rows = queryD1(
  `SELECT id, claimed_at AS claimedAt, revoked_at AS revokedAt FROM legacy_character_claims WHERE id = ${sqlText(claimId)}`,
  remote,
);
if (rows.length !== 1) throw new Error("Claim not found.");
if (rows[0].claimedAt) throw new Error("A successfully used claim cannot be revoked retroactively.");
if (rows[0].revokedAt) {
  console.log("Claim is already revoked.");
  process.exit(0);
}
if (!apply) {
  console.log("Dry run only. Re-run with --apply after reviewing the claim ID.");
  process.exit(0);
}
executeD1(
  `UPDATE legacy_character_claims SET revoked_at = ${sqlText(new Date().toISOString())} WHERE id = ${sqlText(claimId)} AND claimed_at IS NULL AND revoked_at IS NULL;`,
  remote,
);
console.log("Claim revoked.");
