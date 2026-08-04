import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  executeD1,
  operationMode,
  optionValue,
  optionValues,
  queryD1,
  sqlText,
} from "./d1-admin.mjs";

const publicIds = [...new Set(optionValues("--character"))];
const output = optionValue("--output");
const expiresInDays = Number(optionValue("--expires-in-days") ?? "7");
if (publicIds.length < 1) {
  throw new Error("Provide at least one --character=<opaque-public-id>.");
}
if (!output) throw new Error("Provide --output=<private-token-file>.");
const outputPath = resolve(output);
const outputRelativeToRepository = relative(process.cwd(), outputPath);
if (!outputRelativeToRepository.startsWith("..") && !isAbsolute(outputRelativeToRepository)) {
  throw new Error("The private token output file must be outside the repository.");
}
if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
  throw new Error("--expires-in-days must be an integer from 1 through 30.");
}

const { remote, apply } = operationMode();
const inList = publicIds.map(sqlText).join(", ");
const rows = queryD1(
  `SELECT id, public_id AS publicId, owner_user_id AS ownerUserId FROM characters WHERE public_id IN (${inList})`,
  remote,
);
if (rows.length !== publicIds.length) {
  throw new Error("One or more selected public IDs do not exist.");
}
if (rows.some((row) => row.ownerUserId !== null)) {
  throw new Error("One or more selected characters already have an owner.");
}

const now = new Date();
const expiresAt = new Date(
  now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
).toISOString();
const overlapping = queryD1(
  `SELECT count(*) AS count
   FROM legacy_character_claim_items AS item
   JOIN legacy_character_claims AS claim ON claim.id = item.claim_id
   WHERE item.character_id IN (${rows.map((row) => sqlText(row.id)).join(", ")})
     AND claim.claimed_at IS NULL AND claim.revoked_at IS NULL
     AND claim.expires_at > ${sqlText(now.toISOString())}`,
  remote,
);
if (Number(overlapping[0]?.count) > 0) {
  throw new Error("An active claim already includes one of the selected characters.");
}

console.log(`Characters selected for a one-time claim: ${rows.length}`);
if (!apply) {
  console.log("Dry run only. Re-run with --apply after reviewing the selection.");
  process.exit(0);
}

const claimId = randomUUID();
const token = `claim_${randomBytes(32).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
const statements = [
  `INSERT INTO legacy_character_claims (id, token_hash, created_at, expires_at) VALUES (${sqlText(claimId)}, ${sqlText(tokenHash)}, ${sqlText(now.toISOString())}, ${sqlText(expiresAt)});`,
  ...rows.map(
    (row) =>
      `INSERT INTO legacy_character_claim_items (claim_id, character_id) VALUES (${sqlText(claimId)}, ${sqlText(row.id)});`,
  ),
];
executeD1(statements.join("\n"), remote);
writeFileSync(
  outputPath,
  `${JSON.stringify({ claimId, token, expiresAt, characters: publicIds }, null, 2)}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
console.log(`Claim created. The token was written once to ${outputPath}.`);
