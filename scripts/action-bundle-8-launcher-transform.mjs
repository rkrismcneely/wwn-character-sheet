import { readFile, writeFile } from "node:fs/promises";

const path = "app/campaigns/campaign-map-launcher.tsx";
let source = await readFile(path, "utf8");

const importAnchor = 'import { campaignMapOpenEvent, type CampaignMapOpenDetail } from "./campaign-map-events";';
const importLine = 'import { CampaignMapSharedDice } from "./campaign-map-shared-dice";';
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error("Campaign map event import anchor was not found.");
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const toolbarAnchor = '            {canManage && <button type="button" className="campaign-secondary" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(current => !current)}>Map Settings</button>}';
const diceLine = '            {map && <CampaignMapSharedDice campaignId={campaignId} mapId={map.id} open={open} canManage={canManage} />}';
if (!source.includes(diceLine)) {
  if (!source.includes(toolbarAnchor)) throw new Error("Campaign map toolbar anchor was not found.");
  source = source.replace(toolbarAnchor, `${diceLine}\n${toolbarAnchor}`);
}

await writeFile(path, source);
