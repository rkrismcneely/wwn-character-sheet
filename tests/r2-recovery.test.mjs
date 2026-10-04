import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  recoveryObjectKey,
  recoveryPrefixForObject,
  retireR2Object,
} from "../lib/r2-recovery.ts";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("R2 recovery keys are private, deterministic prefixes for the original object", () => {
  const originalKey = "campaign-map/cmp_example/map.png";
  assert.equal(
    recoveryPrefixForObject(originalKey),
    `recovery/${originalKey}/`,
  );
  assert.equal(
    recoveryObjectKey(
      originalKey,
      new Date("2026-10-04T12:00:00.000Z"),
      "recovery-test",
    ),
    `recovery/${originalKey}/20261004T120000000Z-recovery-test`,
  );
});

test("retiring an R2 object copies it before deleting the committed key", async () => {
  const calls = [];
  const bucket = {
    async get(key) {
      calls.push(["get", key]);
      return {
        body: "payload",
        httpMetadata: { contentType: "image/png" },
        customMetadata: { existing: "metadata" },
      };
    },
    async put(key, body, options) {
      calls.push(["put", key]);
      assert.equal(body, "payload");
      assert.equal(options.httpMetadata.contentType, "image/png");
      assert.equal(options.customMetadata.existing, "metadata");
      assert.equal(options.customMetadata.tweRecoveryOriginalKey, "portraits/ch_test/avatar.png");
      assert.equal(options.customMetadata.tweRecoveryArchivedAt, "2026-10-04T12:00:00.000Z");
      return {};
    },
    async delete(key) {
      calls.push(["delete", key]);
    },
  };

  const recoveryKey = await retireR2Object(
    bucket,
    "portraits/ch_test/avatar.png",
    {
      now: new Date("2026-10-04T12:00:00.000Z"),
      recoveryId: "recovery-test",
    },
  );

  assert.equal(
    recoveryKey,
    "recovery/portraits/ch_test/avatar.png/20261004T120000000Z-recovery-test",
  );
  assert.deepEqual(calls.map(call => call[0]), ["get", "put", "delete"]);
});

test("retirement never deletes the original object when the recovery copy fails", async () => {
  let deleted = false;
  const bucket = {
    async get() {
      return { body: "payload", httpMetadata: {}, customMetadata: {} };
    },
    async put() {
      throw new Error("copy failed");
    },
    async delete() {
      deleted = true;
    },
  };

  await assert.rejects(
    retireR2Object(bucket, "portraits/ch_test/avatar.png"),
    /copy failed/u,
  );
  assert.equal(deleted, false);
});

test("committed portrait and map removals use the recovery path", async () => {
  const [portraitRoute, mapBackgroundRoute, mapRoute] = await Promise.all([
    source("app/api/characters/[id]/portrait/route.ts"),
    source("app/api/campaigns/[id]/map/background/route.ts"),
    source("app/api/campaigns/[id]/map/route.ts"),
  ]);

  assert.match(portraitRoute, /retireR2Object\(env\.BUCKET, row\.portraitKey\)/u);
  assert.match(mapBackgroundRoute, /retireR2Object\(env\.BUCKET, previousKey\)/u);
  assert.match(mapBackgroundRoute, /retireR2Object\(env\.BUCKET, result\.previousKey\)/u);
  assert.match(mapRoute, /retireR2Object\(env\.BUCKET, deleted\.deletedKey\)/u);

  // Rollbacks of newly uploaded, never-committed objects remain direct deletes.
  assert.match(portraitRoute, /await env\.BUCKET\.delete\(key\);/u);
  assert.match(mapBackgroundRoute, /env\.BUCKET\.delete\(uploadedKey\)/u);
});
