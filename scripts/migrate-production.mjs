import {
  DATABASE_ID,
  DATABASE_NAME,
  operationMode,
  runWrangler,
} from "./d1-admin.mjs";

const { remote, apply } = operationMode();
if (!remote || !apply) {
  throw new Error(
    `Production migration requires --remote --apply --confirm-database-id=${DATABASE_ID}.`,
  );
}

console.log(`Verified production D1 target: ${DATABASE_NAME} (${DATABASE_ID}).`);
console.log("Pending production migrations:");
console.log(runWrangler([
  "d1",
  "migrations",
  "list",
  DATABASE_NAME,
  "--remote",
  "--config",
  "wrangler.jsonc",
]));
console.log("Applying the reviewed migration list to the verified production D1 database.");
console.log(runWrangler([
  "d1",
  "migrations",
  "apply",
  DATABASE_NAME,
  "--remote",
  "--config",
  "wrangler.jsonc",
]));
