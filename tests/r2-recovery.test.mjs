import assert from "node:assert/strict";
import test from "node:test";
import {
  r2RecoveryObjectKey,
  retireR2ObjectWithRecovery,
} from "../lib/r2-recovery.ts";

class FakeR2Object {
  constructor(bytes, contentType = "image/png") {
    this.bytes = bytes;
    this.httpMetadata = { contentType };
    this.customMetadata = {};
  }

  async arrayBuffer() {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    );
  }
}

function fakeBucket(initialKey, options = {}) {
  const objects = new Map();
  if (initialKey) objects.set(initialKey, new FakeR2Object(new Uint8Array([1, 2, 3])));
  const calls = { puts: [], deletes: [] };
  return {
    objects,
    calls,
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, value, metadata) {
      if (options.failPut) throw new Error("simulated recovery write failure");
      calls.puts.push({ key, metadata });
      const bytes = new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, new FakeR2Object(bytes, metadata?.httpMetadata?.contentType));
    },
    async delete(key) {
      calls.deletes.push(key);
      objects.delete(key);
    },
  };
}

test("R2 recovery keys retain the source path under a private recovery prefix", () => {
  const now = new Date("2026-10-04T15:30:00.000Z");
  const key = r2RecoveryObjectKey("portraits/char/example.png", now, "recovery-id");
  assert.equal(
    key,
    "recovery/portraits/char/example.png/2026-10-04T15-30-00.000Z-recovery-id",
  );
});

test("retiring committed media preserves a copy before deleting the live key", async () => {
  const sourceKey = "campaign-maps/campaign/map.png";
  const bucket = fakeBucket(sourceKey);
  const retired = await retireR2ObjectWithRecovery(
    bucket,
    sourceKey,
    new Date("2026-10-04T15:30:00.000Z"),
  );

  assert.equal(retired, true);
  assert.equal(bucket.objects.has(sourceKey), false);
  assert.deepEqual(bucket.calls.deletes, [sourceKey]);
  assert.equal(bucket.calls.puts.length, 1);
  assert.match(bucket.calls.puts[0].key, /^recovery\/campaign-maps\/campaign\/map\.png\//u);
  assert.equal(bucket.calls.puts[0].metadata.customMetadata.tweRecoverySourceKey, sourceKey);
  assert.equal(
    bucket.calls.puts[0].metadata.customMetadata.tweRecoveryRetiredAt,
    "2026-10-04T15:30:00.000Z",
  );
});

test("a failed recovery copy leaves the original committed object intact", async () => {
  const sourceKey = "portraits/char/example.png";
  const bucket = fakeBucket(sourceKey, { failPut: true });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const retired = await retireR2ObjectWithRecovery(bucket, sourceKey);
    assert.equal(retired, false);
  } finally {
    console.error = originalError;
  }
  assert.equal(bucket.objects.has(sourceKey), true);
  assert.deepEqual(bucket.calls.deletes, []);
});
