import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeClientErrorReport,
  sanitizeErrorName,
  sanitizeRoutePath,
  sanitizeSourcePath,
} from "../lib/observability.ts";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("observability strips dynamic routes, query strings, and fragments", () => {
  assert.equal(
    sanitizeRoutePath("https://taleswithoutend.com/characters/chr_secret-value?token=private#notes"),
    "/characters/:id",
  );
  assert.equal(
    sanitizeRoutePath("/campaigns/cmp_secret-value/maps/42"),
    "/campaigns/:id/maps/:number",
  );
});

test("client error payload accepts only the compact diagnostics schema", () => {
  assert.deepEqual(
    normalizeClientErrorReport({
      kind: "window-error",
      route: "/characters/chr_private?note=secret",
      errorName: "TypeError",
      fingerprint: "0123456789abcdef0123456789abcdef",
      source: "https://taleswithoutend.com/assets/chunks/app-123.js?private=yes",
      line: 42,
      column: 7,
      message: "character name and notes must never be persisted",
      stack: "private stack content",
      userId: "user_secret",
      sessionId: "session_secret",
    }),
    {
      kind: "window-error",
      route: "/characters/:id",
      errorName: "TypeError",
      fingerprint: "0123456789abcdef0123456789abcdef",
      source: "/assets/chunks/app-123.js",
      line: 42,
      column: 7,
    },
  );
});

test("observability rejects unsafe names and source values", () => {
  assert.equal(sanitizeErrorName("My private message"), "Error");
  assert.equal(sanitizeErrorName("CharacterSaveError"), "CharacterSaveError");
  assert.equal(sanitizeSourcePath("/characters/private-name"), undefined);
});

test("runtime reporting omits credentials and raw browser error content", async () => {
  const runtime = await source("app/error-reporter-runtime.tsx");
  assert.match(runtime, /credentials: "omit"/u);
  assert.match(runtime, /MAX_REPORTS_PER_PAGE = 5/u);
  assert.doesNotMatch(runtime, /\.message|\.stack|document\.cookie|localStorage|sessionStorage/u);
});

test("worker logs sanitized structured errors and disables broad invocation logging", async () => {
  const worker = await source("worker/index.ts");
  const wrangler = await source("wrangler.jsonc");
  assert.match(worker, /event: "twe_client_error"/u);
  assert.match(worker, /event: "twe_server_error"/u);
  assert.match(worker, /sanitizeRoutePath\(request\.url\)/u);
  assert.doesNotMatch(worker, /request\.text\(\)[\s\S]*console\.error\([^)]*raw/u);
  assert.match(wrangler, /"observability"\s*:\s*\{/u);
  assert.match(wrangler, /"invocation_logs"\s*:\s*false/u);
});

test("root layout and React boundary install client reporting globally", async () => {
  const layout = await source("app/layout.tsx");
  const boundary = await source("app/error.tsx");
  assert.match(layout, /<ErrorReporterRuntime \/>/u);
  assert.match(boundary, /reportClientError\("react-boundary", error\)/u);
  assert.match(boundary, /character and campaign data were not included/u);
});
