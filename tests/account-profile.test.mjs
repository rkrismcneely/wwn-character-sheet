import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AccountProfileError,
  readAccountProfile,
  resetAccountDisplayName,
  updateAccountDisplayName,
} from "../lib/account/profile.ts";
import {
  DISPLAY_NAME_MAX_LENGTH,
  effectiveDisplayName,
  normalizeDisplayName,
} from "../lib/account/display-name.ts";

class TestStatement {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }
  bind(...values) {
    this.values = values;
    return this;
  }
  async first() {
    return this.statement.get(...this.values) ?? null;
  }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  constructor(database) {
    this.database = database;
  }
  prepare(sql) {
    return new TestStatement(this.database.prepare(sql));
  }
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT,
      email TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO user (id, name, display_name, email, updated_at) VALUES
      ('user-a', 'Google Alice', NULL, 'alice@example.invalid', 1),
      ('user-b', 'Google Bob', NULL, 'bob@example.invalid', 1);
  `);
  return { sqlite, db: new TestD1(sqlite) };
}

const userA = { userId: "user-a", role: "user" };
const userB = { userId: "user-b", role: "user" };

test("effective display names prefer the application override and fall back safely", () => {
  assert.equal(effectiveDisplayName("  Rowan  ", "Google Alice"), "Rowan");
  assert.equal(effectiveDisplayName(null, "Google Alice"), "Google Alice");
  assert.equal(effectiveDisplayName("", "Google Alice"), "Google Alice");
});

test("authenticated profile updates persist only for the current account and reset to Google", async () => {
  const { sqlite, db } = fixture();
  const initial = await readAccountProfile(db, userA);
  assert.equal(initial.effectiveDisplayName, "Google Alice");
  assert.equal(initial.usesProviderName, true);

  const updated = await updateAccountDisplayName(
    db,
    userA,
    "  Rowan   of the Road  ",
    10,
  );
  assert.equal(updated.displayName, "Rowan of the Road");
  assert.equal(updated.effectiveDisplayName, "Rowan of the Road");
  assert.equal(updated.usesProviderName, false);
  assert.equal((await readAccountProfile(db, userA)).effectiveDisplayName, "Rowan of the Road");
  assert.equal((await readAccountProfile(db, userB)).effectiveDisplayName, "Google Bob");

  await updateAccountDisplayName(db, userB, "Rowan of the Road", 11);
  assert.equal((await readAccountProfile(db, userB)).effectiveDisplayName, "Rowan of the Road");

  const reset = await resetAccountDisplayName(db, userA, 12);
  assert.equal(reset.displayName, null);
  assert.equal(reset.effectiveDisplayName, "Google Alice");
  assert.equal(reset.usesProviderName, true);
  assert.equal(sqlite.prepare("SELECT updated_at AS updatedAt FROM user WHERE id = 'user-a'").get().updatedAt, 12);
});

test("profile writes reject unauthenticated, empty, overlong, control, and invisible names", async () => {
  const { db } = fixture();
  await assert.rejects(
    readAccountProfile(db, null),
    error => error instanceof AccountProfileError && error.status === 401,
  );
  const invalid = [
    "",
    " ",
    "A",
    "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
    "Line\nBreak",
    "Hidden\u200bName",
    null,
  ];
  for (const value of invalid) {
    await assert.rejects(
      updateAccountDisplayName(db, userA, value),
      error => error instanceof AccountProfileError && error.status === 422,
      String(value),
    );
  }
  assert.equal(normalizeDisplayName("Éowyn — Shieldmaiden"), "Éowyn — Shieldmaiden");
});

test("migration 0007 is additive and leaves existing provider identity intact", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'user' NOT NULL
    );
    INSERT INTO user (id, name, email, role)
    VALUES ('existing', 'Existing Google Name', 'existing@example.invalid', 'admin');
  `);
  const migration = await readFile(
    new URL("../drizzle/0007_user_display_name.sql", import.meta.url),
    "utf8",
  );
  sqlite.exec(migration);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT id, name, email, role, display_name AS displayName FROM user").get() },
    {
      id: "existing",
      name: "Existing Google Name",
      email: "existing@example.invalid",
      role: "admin",
      displayName: null,
    },
  );
  sqlite.prepare("UPDATE user SET display_name = ? WHERE id = ?").run("Ledger Keeper", "existing");
  assert.equal(
    sqlite.prepare("SELECT display_name AS displayName FROM user WHERE id = 'existing'").get().displayName,
    "Ledger Keeper",
  );
  assert.throws(() => sqlite.prepare("UPDATE user SET display_name = 'X' WHERE id = 'existing'").run());
});
