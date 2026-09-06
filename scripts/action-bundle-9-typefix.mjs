import { readFile, writeFile } from "node:fs/promises";

const path = "app/campaigns/campaign-map-launcher.tsx";
let source = await readFile(path, "utf8");
source = source.replace(
  '  CampaignMapCharacterOption,\n  CampaignMapCompanionOption,\n  CampaignMapPayload,',
  '  CampaignMapCharacterOption,\n  CampaignMapPayload,',
);
const anchor = '} from "@/lib/campaigns/map";';
const companionImport = 'import type { CampaignMapCompanionOption } from "@/lib/campaigns/map-companions";';
if (!source.includes(companionImport)) {
  if (!source.includes(anchor)) throw new Error("map type import anchor not found");
  source = source.replace(anchor, `${anchor}\n${companionImport}`);
}
await writeFile(path, source);
