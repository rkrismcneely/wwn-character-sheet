import { readFile, rm, writeFile } from "node:fs/promises";

async function edit(path, transform) {
  const source = await readFile(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`${path}: transform made no changes`);
  await writeFile(path, next);
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    // Most anchors are expected once. Callers that intentionally patch repeated
    // inventory controls use replaceAll instead.
    throw new Error(`Ambiguous ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

await edit("app/character-sheet.tsx", source => {
  let next = source;
  next = replaceOnce(
    next,
    'import type { CharacterVisibility } from "@/lib/characters/authorization";\n',
    'import type { CharacterVisibility } from "@/lib/characters/authorization";\nimport { campaignInventorySnapshot, campaignInventoryValue, inventoryItemDisplayName } from "@/lib/inventory/items";\nimport { CampaignInventoryOptions, StoredItemsSection, useCampaignInventoryItems } from "./inventory-stored-items";\n',
    "character inventory imports",
  );

  const initialStowed = /\n  stowed: \[[^\n]+\],\n  goals: "",/u;
  if (!initialStowed.test(next)) throw new Error("Missing initial stowed inventory");
  next = next.replace(initialStowed, match => match.replace('\n  goals: "",', '\n  stored: [] as string[],\n  goals: "",'));
  next = replaceOnce(
    next,
    '  stowed: Array(8).fill(""),\n  goals: "",',
    '  stowed: Array(8).fill(""),\n  stored: [] as string[],\n  goals: "",',
    "blank stored inventory",
  );
  next = replaceOnce(
    next,
    '    languages: normalizeLanguages(incoming.languages),\n    companions:',
    '    languages: normalizeLanguages(incoming.languages),\n    stored: Array.isArray(incoming.stored) ? incoming.stored.filter((item): item is string => typeof item === "string") : [],\n    companions:',
    "stored inventory normalization",
  );
  next = replaceOnce(
    next,
    '    readied: [...blankCharacter.readied],\n    stowed: [...blankCharacter.stowed],\n',
    '    readied: [...blankCharacter.readied],\n    stowed: [...blankCharacter.stowed],\n    stored: [...blankCharacter.stored],\n',
    "blank stored clone",
  );
  next = replaceOnce(
    next,
    '  const canEdit = signedIn && (!cloudId || cloudCanEdit);\n  const buildFieldsEditable = canEdit && (!cloudId || characterEditMode);',
    '  const canEdit = signedIn && (!cloudId || cloudCanEdit);\n  const { items: campaignInventoryItems, error: campaignInventoryError } = useCampaignInventoryItems(cloudId, campaignLinks, canEdit);\n  const buildFieldsEditable = canEdit && (!cloudId || characterEditMode);',
    "campaign inventory hook",
  );

  next = replaceOnce(
    next,
    '  const setStowedItem = (index: number, value: string) => {\n    if (value === "Unarmed Attack") return;\n    patch("stowed", stowedSlots.map((item, itemIndex) => itemIndex === index ? value : item));\n  };\n',
    '  const setStowedItem = (index: number, value: string) => {\n    if (value === "Unarmed Attack") return;\n    patch("stowed", stowedSlots.map((item, itemIndex) => itemIndex === index ? value : item));\n  };\n  const moveStowedToStored = (index: number) => {\n    setOtherStowedIndex(null);\n    setSheet(current => {\n      const currentStowed = inventorySlots(current.stowed, stowedCapacity);\n      const item = currentStowed[index] || "";\n      if (!item) return current;\n      const nextStowed = compactInventory(currentStowed.filter((_, itemIndex) => itemIndex !== index), stowedCapacity);\n      return { ...current, stowed: nextStowed, stored: [...current.stored.filter(stored => stored.trim()), item] };\n    });\n  };\n  const moveStoredToStowed = (index: number) => {\n    setSheet(current => {\n      const currentStored = current.stored.filter(item => item.trim());\n      const item = currentStored[index] || "";\n      if (!item) return current;\n      const nextStored = currentStored.filter((_, itemIndex) => itemIndex !== index);\n      const nextStowed = inventorySlots([...current.stowed.filter(stowed => stowed.trim()), item], stowedCapacity);\n      return { ...current, stored: nextStored, stowed: nextStowed };\n    });\n  };\n',
    "stored inventory movement",
  );

  next = replaceOnce(
    next,
    '  const dropInventoryItem = (location: "readied" | "stowed", index: number, item: string) => {\n    if (!window.confirm(`Drop ${item}?\\n\\nThis removes it from the character’s inventory.`)) return;',
    '  const dropInventoryItem = (location: "readied" | "stowed", index: number, item: string) => {\n    if (!window.confirm(`Drop ${inventoryItemDisplayName(item)}?\\n\\nThis removes it from the character’s inventory.`)) return;',
    "inventory drop label",
  );

  next = next.replaceAll(
    'const isCustom = Boolean(item) && !officialInventorySet.has(item);',
    'const isCustom = Boolean(item) && !campaignInventorySnapshot(item) && !officialInventorySet.has(item);',
  );
  next = next.replaceAll(
    '{item || "Choose a stowed item…"}',
    '{item ? inventoryItemDisplayName(item) : "Choose a stowed item…"}',
  );
  next = next.replaceAll(
    '>{entry.name}</option>',
    '>{inventoryItemDisplayName(entry.name)}</option>',
  );
  next = next.replaceAll(
    '<option value="__other__">Other…</option>',
    '<option value="__other__">Other…</option>\n                    {campaignInventorySnapshot(item) && !campaignInventoryItems.some(candidate => campaignInventoryValue(candidate) === item) && <option value={item}>{inventoryItemDisplayName(item)} · Campaign item</option>}\n                    <CampaignInventoryOptions items={campaignInventoryItems} />',
  );

  next = replaceOnce(
    next,
    '                  {(isCustom || otherStowedIndex === i) && <input autoFocus={otherStowedIndex === i && !item} aria-label={`Other stowed item ${i + 1}`} placeholder="Type another item…" value={item} onChange={e => setStowedItem(i, e.target.value)} />}\n                </label>\n                {item && <button type="button" className="drop-item" onClick={() => dropInventoryItem("stowed", i, item)}>Drop</button>}',
    '                  {(isCustom || otherStowedIndex === i) && <input autoFocus={otherStowedIndex === i && !item} aria-label={`Other stowed item ${i + 1}`} placeholder="Type another item…" value={isCustom ? item : ""} onChange={e => setStowedItem(i, e.target.value)} />}\n                  {campaignInventorySnapshot(item) && <small className="campaign-item-description"><strong>{campaignInventorySnapshot(item)?.kind === "magical" ? "Magical" : "Mundane"}</strong>{campaignInventorySnapshot(item)?.description ? ` · ${campaignInventorySnapshot(item)?.description}` : ""}</small>}\n                </label>\n                {item && <span className="inventory-item-actions"><button type="button" className="drop-item" onClick={() => moveStowedToStored(i)}>Store</button><button type="button" className="drop-item" onClick={() => dropInventoryItem("stowed", i, item)}>Drop</button></span>}',
    "PC stowed item actions",
  );

  next = replaceOnce(
    next,
    '            {!stowedSlots.length && <p className="empty-slots">No Stowed slots until a Strength score is selected.</p>}\n          </Section>\n        </div>}',
    '            {!stowedSlots.length && <p className="empty-slots">No Stowed slots until a Strength score is selected.</p>}\n          </Section>\n          <StoredItemsSection items={sheet.stored} campaignItems={campaignInventoryItems} campaignError={campaignInventoryError} onChange={items => patch("stored", items)} onStow={moveStoredToStowed} />\n        </div>}',
    "Stored Items section",
  );

  next = next.replace(
    'if (!window.confirm(`Drop ${item}?\\n\\nThis removes it from ${companion.name || "the companion"}’s inventory.`)) return;',
    'if (!window.confirm(`Drop ${inventoryItemDisplayName(item)}?\\n\\nThis removes it from ${companion.name || "the companion"}’s inventory.`)) return;',
  );
  next = next.replace(
    '                    {(isCustom || editingOther) && <input autoFocus={editingOther && !item} aria-label={`Other companion stowed item ${index + 1}`} placeholder="Type another item…" value={item} onChange={e => setCompanionStowedItem(index, e.target.value)} />}\n                  </label>',
    '                    {(isCustom || editingOther) && <input autoFocus={editingOther && !item} aria-label={`Other companion stowed item ${index + 1}`} placeholder="Type another item…" value={isCustom ? item : ""} onChange={e => setCompanionStowedItem(index, e.target.value)} />}\n                    {campaignInventorySnapshot(item) && <small className="campaign-item-description"><strong>{campaignInventorySnapshot(item)?.kind === "magical" ? "Magical" : "Mundane"}</strong>{campaignInventorySnapshot(item)?.description ? ` · ${campaignInventorySnapshot(item)?.description}` : ""}</small>}\n                  </label>',
  );
  return next;
});

await edit("app/campaigns/gm-console.tsx", source => {
  let next = source;
  next = replaceOnce(
    next,
    'import { RulesAssistant } from "@/app/rules-assistant";\n',
    'import { RulesAssistant } from "@/app/rules-assistant";\nimport { CampaignItemLibrary } from "./campaign-item-library";\n',
    "GM item library import",
  );
  next = replaceOnce(
    next,
    'type ConsoleTab = "encounter" | "bestiary" | "npcs" | "party";',
    'type ConsoleTab = "encounter" | "bestiary" | "npcs" | "items" | "party";',
    "GM item tab type",
  );
  next = replaceOnce(
    next,
    '(["encounter", "bestiary", "npcs", "party"] as ConsoleTab[])',
    '(["encounter", "bestiary", "npcs", "items", "party"] as ConsoleTab[])',
    "GM item tab navigation",
  );
  next = replaceOnce(
    next,
    '{tab === "npcs" && <NpcLibrary campaignId={campaignId} activeEncounter={Boolean(session?.encounter)} onAddToEncounter={npcId => encounterAction({ action: "add_saved_npc", npcId })} />}\n      {tab === "party"',
    '{tab === "npcs" && <NpcLibrary campaignId={campaignId} activeEncounter={Boolean(session?.encounter)} onAddToEncounter={npcId => encounterAction({ action: "add_saved_npc", npcId })} />}\n      {tab === "items" && <CampaignItemLibrary campaignId={campaignId} />}\n      {tab === "party"',
    "GM item tab content",
  );
  return next;
});

await edit("app/globals.css", source => {
  if (source.includes(".stored-items-section")) throw new Error("Stored item styles already exist");
  return `${source}\n\n/* Action Bundle 6: durable off-person inventory and campaign-item metadata. */\n.stored-items-section{grid-column:1/-1}\n.inventory-item-actions{display:flex;align-items:center;gap:6px;align-self:end;margin-bottom:9px}\n.campaign-item-description{display:block;margin-top:5px;color:var(--muted);font:11px/1.4 var(--font-ui);text-transform:none;letter-spacing:0}\n.campaign-item-description strong{color:var(--amber-dark)}\n.campaign-item-load-error{margin:0 0 10px;padding:8px 10px;border-left:3px solid #9e5a36;background:#f3ded1;color:#683a25;font:12px/1.4 var(--font-ui)}\n.stored-item-row{grid-template-columns:minmax(0,1fr) auto}\n@media(max-width:720px){.stored-items-section{grid-column:auto}.inventory-item-actions{flex-wrap:wrap;justify-content:flex-end}}\n`;
});

await edit("app/campaigns/campaign-ui.css", source => {
  if (source.includes(".campaign-item-visibility")) throw new Error("Campaign item styles already exist");
  return `${source}\n\n/* Action Bundle 6: campaign item library. */\n.campaign-item-fields{grid-template-columns:minmax(0,2fr) minmax(150px,1fr)}\n.campaign-item-visibility{margin:14px 0;padding:12px;border:1px solid var(--campaign-border,#c7b28a);display:grid;gap:9px}\n.campaign-item-visibility>label{display:flex;align-items:center;gap:8px}\n.campaign-item-character-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px 12px;padding:8px 0 0 24px}\n.campaign-item-character-grid label{display:flex;align-items:center;gap:7px}\n.campaign-item-card p{white-space:pre-wrap}\n.campaign-item-card .campaign-kicker{margin-bottom:4px}\n@media(max-width:720px){.campaign-item-fields{grid-template-columns:1fr}.campaign-item-character-grid{grid-template-columns:1fr;padding-left:8px}}\n`;
});

await edit("db/schema.ts", source => {
  const insertion = `export const campaignItems = sqliteTable(\n  "campaign_items",\n  {\n    id: text("id").primaryKey(),\n    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),\n    name: text("name").notNull(),\n    kind: text("kind", { enum: ["mundane", "magical"] }).notNull().default("mundane"),\n    description: text("description").notNull().default(""),\n    visibilityMode: text("visibility_mode", { enum: ["all", "selected"] }).notNull().default("all"),\n    createdAt: text("created_at").notNull(),\n    updatedAt: text("updated_at").notNull(),\n  },\n  (table) => [\n    index("campaign_items_campaign_name_idx").on(table.campaignId, table.name, table.updatedAt),\n    check("campaign_items_kind_check", sql\`${table.kind} in ('mundane', 'magical')\`),\n    check("campaign_items_visibility_check", sql\`${table.visibilityMode} in ('all', 'selected')\`),\n  ],\n);\n\nexport const campaignItemCharacters = sqliteTable(\n  "campaign_item_characters",\n  {\n    campaignItemId: text("campaign_item_id").notNull().references(() => campaignItems.id, { onDelete: "cascade" }),\n    characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),\n  },\n  (table) => [\n    primaryKey({ columns: [table.campaignItemId, table.characterId] }),\n    index("campaign_item_characters_character_idx").on(table.characterId, table.campaignItemId),\n  ],\n);\n\n`;
  return replaceOnce(source, "export const campaignSessions = sqliteTable(\n", `${insertion}export const campaignSessions = sqliteTable(\n`, "campaign item schema insertion");
});

await edit(".github/workflows/deploy-production.yml", source => {
  const guard = `          if [ "${{ github.event_name }}" = "push" ] && git diff-tree --no-commit-id --name-only -r -m "${GITHUB_SHA}" | grep -Eq "^drizzle/0016_campaign_items\\.sql$|^scripts/migrate-campaign-items\\.mjs$|^\\.github/workflows/migrate-campaign-items\\.yml$"; then\n            echo "skip=true" >> "${GITHUB_OUTPUT}"\n            echo "The campaign-item migration workflow owns this release."\n            exit 0\n          fi\n`;
  return replaceOnce(
    source,
    '          if [ "${{ github.event_name }}" = "push" ] && git diff-tree --no-commit-id --name-only -r -m "${GITHUB_SHA}" | grep -Eq "^drizzle/001(4_campaign_map_foundation|5_campaign_map_interactions)\\.sql$|^scripts/migrate-campaign-map-foundation\\.mjs$|^\\.github/workflows/migrate-campaign-map-foundation\\.yml$"; then\n',
    `${guard}          if [ "${{ github.event_name }}" = "push" ] && git diff-tree --no-commit-id --name-only -r -m "${GITHUB_SHA}" | grep -Eq "^drizzle/001(4_campaign_map_foundation|5_campaign_map_interactions)\\.sql$|^scripts/migrate-campaign-map-foundation\\.mjs$|^\\.github/workflows/migrate-campaign-map-foundation\\.yml$"; then\n`,
    "campaign item deploy guard",
  );
});

await rm("scripts/action-bundle-6-transform.mjs", { force: true });
await rm(".github/workflows/action-bundle-6-transform.yml", { force: true });
