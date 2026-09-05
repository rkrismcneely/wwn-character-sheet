import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected one ${label} target, found ${count}`);
  return source.replace(oldText, newText);
}

function removeTest(source, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\ntest\\("${escaped}"[\\s\\S]*?\\n\\}\\);\\n`, "u");
  if (!pattern.test(source)) throw new Error(`Could not find test: ${title}`);
  return source.replace(pattern, "\n");
}

// Campaign foundation: legacy claim token helpers were only present to test the now-removed claim path.
{
  const path = "tests/campaign-foundation.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    `import {\n  generateLegacyClaimToken,\n  generatePublicCharacterId,\n  hashLegacyClaimToken,\n} from "../lib/characters/identifiers.ts";`,
    `import { generatePublicCharacterId } from "../lib/characters/identifiers.ts";`,
    "campaign-foundation character identifier import",
  );
  source = replaceOnce(
    source,
    `test("shared opaque-token utility preserves existing character token behavior", async () => {\n  const publicId = generatePublicCharacterId();\n  const claim = generateLegacyClaimToken();\n  assert.match(publicId, /^chr_[A-Za-z0-9_-]{22}$/u);\n  assert.match(claim, /^claim_[A-Za-z0-9_-]{43}$/u);\n  assert.match(await hashLegacyClaimToken(claim), /^[0-9a-f]{64}$/u);\n});`,
    `test("character public IDs retain their opaque format", () => {\n  const publicId = generatePublicCharacterId();\n  assert.match(publicId, /^chr_[A-Za-z0-9_-]{22}$/u);\n});`,
    "campaign-foundation legacy token test",
  );
  await writeFile(path, source);
}

// Dashboard: the legacy claim surface is intentionally gone.
{
  const path = "tests/dashboard.test.mjs";
  let source = await readFile(path, "utf8");
  source = source.replace(`  assert.match(dashboard, /\\/api\\/legacy-claims/u);\n`, "");
  source = source.replace(
    `test("dashboard exposes useful roster, empty, import, and claim states", async () => {`,
    `test("dashboard exposes useful roster and empty states without legacy claiming", async () => {`,
  );
  source = source.replace(`    "Claim a legacy character",\n    "One-time claim code",\n`, "");
  source = replaceOnce(
    source,
    `  assert.equal(header.includes("Sign Out"), true);\n});`,
    `  assert.equal(header.includes("Sign Out"), true);\n  assert.doesNotMatch(dashboard, /legacy claim|legacy-claims|One-time claim code/iu);\n});`,
    "dashboard legacy removal assertion",
  );
  await writeFile(path, source);
}

// Campaign/UI assertions now target the consolidated bottom utility row.
{
  const path = "tests/campaign-ui.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    `  assert.match(sheet, /cloudId && canEdit && campaignLinks\\.length > 0/u);\n  assert.match(sheet, /character-campaign-links/u);\n  assert.match(sheet, /Open Campaign/u);\n  assert.ok(\n    sheet.indexOf("character-campaign-links") > sheet.indexOf("Privacy & Sharing") - 2000,\n    "campaign navigation belongs near the established bottom utility area",\n  );\n  assert.match(css, /\\.character-campaign-links nav\\{[^}]*flex-wrap:wrap/u);\n  assert.match(css, /\\.character-campaign-links a\\{[\\s\\S]*min-height:40px/u);`,
    `  assert.match(sheet, /cloudId && canEdit && <section className="character-bottom-utilities"/u);\n  assert.match(sheet, /campaignLinks\\.length > 0 && <details className="character-campaign-utility"/u);\n  assert.match(sheet, /Campaigns \\(\\{campaignLinks\\.length\\}\\)/u);\n  assert.ok(\n    sheet.indexOf("character-campaign-utility") > sheet.indexOf('<div className="hero">'),\n    "campaign navigation belongs in the bottom utility area",\n  );\n  assert.match(css, /\\.character-campaign-utility nav\\{[\\s\\S]*position:absolute/u);\n  assert.match(css, /\\.character-campaign-utility a\\{[\\s\\S]*display:flex/u);`,
    "campaign utility assertions",
  );
  source = source.replace(`  assert.match(sheet, /Privacy & Sharing/u);\n`, `  assert.match(sheet, /character-bottom-utilities/u);\n  assert.match(sheet, />Visibility<\\/span><select/u);\n`);
  await writeFile(path, source);
}

// Phase 4B reconciliation no longer carries a test for a feature intentionally deleted by Bundle 5.
{
  const path = "tests/phase4b-reconciliation.test.mjs";
  let source = await readFile(path, "utf8");
  source = removeTest(source, "legacy claim creation preserves recovery material before D1 mutation");
  await writeFile(path, source);
}

// Phase 4B security keeps current auth/ownership coverage while deleting obsolete claim-only fixtures/tests.
{
  const path = "tests/phase4b-security.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    `import {\n  generateLegacyClaimToken,\n  generatePublicCharacterId,\n  hashLegacyClaimToken,\n  isPlausibleLegacyClaimToken,\n  isPlausiblePublicCharacterId,\n} from "../lib/characters/identifiers.ts";`,
    `import {\n  generatePublicCharacterId,\n  isPlausiblePublicCharacterId,\n} from "../lib/characters/identifiers.ts";`,
    "phase4b identifier imports",
  );
  source = source.replace(
    `import {\n  claimLegacyCharacters,\n  LegacyClaimError,\n} from "../lib/characters/claims.ts";\n`,
    "",
  );
  source = replaceOnce(
    source,
    `  const [characterRoute, portraitRoute, claimRoute] = await Promise.all([\n    source("app/api/characters/[id]/route.ts"),\n    source("app/api/characters/[id]/portrait/route.ts"),\n    source("app/api/legacy-claims/route.ts"),\n  ]);`,
    `  const [characterRoute, portraitRoute] = await Promise.all([\n    source("app/api/characters/[id]/route.ts"),\n    source("app/api/characters/[id]/portrait/route.ts"),\n  ]);`,
    "phase4b mutation route list",
  );
  source = source.replace(`  assert.doesNotMatch(claimRoute, /role\\s*===\\s*["']admin/u);\n`, "");
  source = source.replace(
    `  assert.match(page, /cloudId && canEdit && <section className="character-sharing character-sharing-footer"/u);`,
    `  assert.match(page, /cloudId && canEdit && <section className="character-bottom-utilities"/u);`,
  );
  const fixtureStart = source.indexOf("\nclass FakeClaimStatement {");
  const fixtureEndMarker = `\ntest("visible Google sign-in controls keep direct Better Auth click paths"`;
  const fixtureEnd = source.indexOf(fixtureEndMarker);
  if (fixtureStart < 0 || fixtureEnd < 0 || fixtureEnd <= fixtureStart) throw new Error("Could not isolate legacy claim fixtures");
  source = source.slice(0, fixtureStart) + "\n" + source.slice(fixtureEnd);
  source = source.replace(
    `test("production migration and legacy admin commands fail closed", async () => {`,
    `test("production migration and admin commands fail closed", async () => {`,
  );
  source = source.replace(`  const claim = await source("scripts/create-legacy-claim.mjs");\n`, "");
  source = source.replace(`  assert.match(claim, /private token output file must be outside the repository/u);\n  assert.match(claim, /mode: 0o600/u);\n  assert.doesNotMatch(claim, /console\\.log\\(\\s*token\\s*\\)/u);\n`, "");
  if (/legacy-claims|LegacyClaim|generateLegacyClaim|hashLegacyClaim|claimLegacyCharacters|create-legacy-claim/u.test(source)) {
    throw new Error("Obsolete legacy claim security reference remains");
  }
  await writeFile(path, source);
}

// Rendered Worker tests should now prove the removed endpoint is gone, not authenticated.
{
  const path = "tests/rendered-html.test.mjs";
  let source = await readFile(path, "utf8");
  source = source.replace(`      ["/api/legacy-claims", "POST", { token: \`claim_\${"A".repeat(43)}\` }],\n`, "");
  source = source.replace(`    assert.match(normalRootHTML, /Claim a legacy character/u);\n`, `    assert.doesNotMatch(normalRootHTML, /Claim a legacy character|One-time claim code/u);\n`);
  await writeFile(path, source);
}

console.log("Updated stale tests for Action Bundle 5.");
