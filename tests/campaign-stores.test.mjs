import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign stores preserve a server-authoritative party-visible item snapshot", async () => {
  const [
    migration,
    service,
    listRoute,
    activeRoute,
    storeRoute,
    itemRoute,
    library,
    launcher,
    control,
    linkedPage,
    standalonePage,
  ] = await Promise.all([
    readFile(new URL("../drizzle/0024_campaign_stores.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/stores.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/stores/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/stores/active/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/stores/[storeId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/stores/[storeId]/items/[itemId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-store-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-store-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-store-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/[id]/characters/[characterId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE .*campaign_stores/u);
  assert.match(migration, /CREATE TABLE .*campaign_store_items/u);
  assert.match(migration, /campaign_stores_one_active_per_campaign_idx/u);
  assert.match(migration, /source_type.*'srd', 'campaign'/su);
  assert.match(service, /storeCatalogById/u);
  assert.match(service, /canManageCampaignContent/u);
  assert.match(service, /readActiveCampaignStore/u);
  assert.match(service, /normal campaign-item selected-character restrictions do not apply/u);
  assert.match(service, /FROM campaign_store_items/u);
  assert.match(service, /sourceType === "campaign"/u);
  assert.match(service, /Built-in catalog keys intentionally contain punctuation/u);
  assert.match(service, /sourceType === "srd"\s*\? plainText\(value, "Source item", 240\)/u);
  assert.match(service, /: identifier\(value, "Source item"\)/u);
  assert.match(listRoute, /listCampaignStoresForManagement/u);
  assert.match(activeRoute, /readActiveCampaignStore/u);
  assert.match(activeRoute, /searchParams\.get\("characterId"\)/u);
  assert.match(storeRoute, /setCampaignStoreActive/u);
  assert.match(itemRoute, /updateCampaignStoreItem/u);
  assert.match(library, /SRD item/u);
  assert.match(library, /Campaign custom item/u);
  assert.match(library, /Make Visible to Party/u);
  assert.match(library, /normal item visibility is restricted/u);
  assert.match(launcher, /stores\/active/u);
  assert.match(launcher, /campaignStoreOpenEvent/u);
  assert.match(launcher, /campaignMapOpenEvent/u);
  assert.match(control, /Store/u);
  assert.match(linkedPage, /CampaignCharacterStoreControl/u);
  assert.match(linkedPage, /CampaignStoreLauncher/u);
  assert.match(standalonePage, /CampaignCharacterStoreControl/u);
  assert.match(standalonePage, /CampaignStoreLauncher/u);
});

test("campaign store migration gets the dedicated production release guard", async () => {
  const [script, workflow, deployment, css] = await Promise.all([
    readFile(new URL("../scripts/migrate-campaign-stores.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-stores.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-store.css", import.meta.url), "utf8"),
  ]);

  assert.match(script, /0024_campaign_stores\.sql/u);
  assert.match(script, /campaign_stores/u);
  assert.match(script, /campaign_store_items/u);
  assert.match(workflow, /migrate-campaign-stores/u);
  assert.match(deployment, /campaign-store migration workflow owns this release/u);
  assert.match(css, /campaign-store-drawer/u);
  assert.match(css, /campaign-store-management-layout/u);
});
