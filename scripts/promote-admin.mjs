import {
  DATABASE_ID,
  executeD1,
  operationMode,
  queryD1,
  sqlText,
} from "./d1-admin.mjs";

const email = process.env.TWE_ADMIN_EMAIL?.trim();
if (!email) {
  throw new Error(
    "Set TWE_ADMIN_EMAIL to the exact existing Better Auth account email.",
  );
}

const { remote, apply } = operationMode();
const matchingUsers = queryD1(
  `SELECT id, role FROM user WHERE lower(email) = lower(${sqlText(email)})`,
  remote,
);
if (matchingUsers.length !== 1) {
  throw new Error(
    `Expected exactly one matching Better Auth user; found ${matchingUsers.length}.`,
  );
}

console.log("Matched exactly one existing Better Auth user.");
if (!apply) {
  console.log("Dry run only; no role was changed. Re-run with --apply to promote.");
  process.exit(0);
}

const [{ id }] = matchingUsers;
executeD1(
  `UPDATE user SET role = 'admin' WHERE id = ${sqlText(id)} AND role = 'user'`,
  remote,
);
const verified = queryD1(
  `SELECT role FROM user WHERE id = ${sqlText(id)}`,
  remote,
);
if (verified.length !== 1 || verified[0].role !== "admin") {
  throw new Error("Administrator promotion could not be verified.");
}

console.log("Administrator role applied and verified for exactly one user.");
if (remote) {
  console.log(`Verified production target confirmation: ${DATABASE_ID}.`);
}
