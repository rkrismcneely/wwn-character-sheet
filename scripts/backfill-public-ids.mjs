import { randomBytes } from "node:crypto";
import {
  executeD1,
  operationMode,
  queryD1,
  sqlText,
} from "./d1-admin.mjs";

function publicId() {
  return `chr_${randomBytes(16).toString("base64url")}`;
}

function portraitKey(data) {
  try {
    const portrait = JSON.parse(data)?.portrait;
    if (typeof portrait !== "string" || !portrait.startsWith("/api/portraits/")) {
      return null;
    }
    const encoded = portrait.slice("/api/portraits/".length);
    const decoded = decodeURIComponent(encoded);
    return decoded.startsWith("portraits/") && !decoded.includes("..")
      ? decoded
      : null;
  } catch {
    return null;
  }
}

const { remote, apply } = operationMode();
const rows = queryD1(
  "SELECT id, data FROM characters WHERE public_id IS NULL ORDER BY id",
  remote,
);
const existingPublicIds = queryD1(
  "SELECT public_id AS publicId FROM characters WHERE public_id IS NOT NULL",
  remote,
);

console.log(`Legacy characters requiring public IDs: ${rows.length}`);
if (!apply) {
  console.log("Dry run only. Re-run with --apply after reviewing the target.");
  process.exit(0);
}

const assigned = new Set(existingPublicIds.map((row) => row.publicId));
const statements = rows.map((row) => {
  let nextPublicId = publicId();
  while (assigned.has(nextPublicId)) nextPublicId = publicId();
  assigned.add(nextPublicId);
  const key = portraitKey(row.data);
  return `UPDATE characters SET public_id = ${sqlText(nextPublicId)}, portrait_key = COALESCE(portrait_key, ${key ? sqlText(key) : "NULL"}) WHERE id = ${sqlText(row.id)} AND public_id IS NULL;`;
});

for (let index = 0; index < statements.length; index += 50) {
  executeD1(statements.slice(index, index + 50).join("\n"), remote);
}

const remaining = queryD1(
  "SELECT count(*) AS count FROM characters WHERE public_id IS NULL",
  remote,
);
if (Number(remaining[0]?.count) !== 0) {
  throw new Error("Public ID backfill did not cover every legacy character.");
}
console.log(`Backfilled ${rows.length} legacy character public ID(s).`);
