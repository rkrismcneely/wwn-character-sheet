import { readFile, writeFile } from "node:fs/promises";

async function transform(path, edits) {
  let source = await readFile(path, "utf8");
  for (const [before, after, label] of edits) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) throw new Error(`${path}: ${label} anchor not found`);
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await transform("lib/campaigns/map.ts", [
  [
    'import type { MapBackgroundContentType, MapImageDimensions } from "./map-images.ts";',
    'import type { MapBackgroundContentType, MapImageDimensions } from "./map-images.ts";\nimport {\n  campaignMapCompanionCharacterId,\n  campaignMapCompanionsFromCharacterData,\n  type CampaignMapCompanionOption,\n} from "./map-companions.ts";',
    "companion import",
  ],
  [
    'interface CampaignMapTokenRow {\n  id: string;\n  campaignId: string;\n  mapId: string;\n  kind: "pc" | "npc";',
    'interface CampaignMapTokenRow {\n  id: string;\n  campaignId: string;\n  mapId: string;\n  kind: "pc" | "npc" | "companion";',
    "row token kind",
  ],
  [
    'export interface CampaignMapToken {\n  id: string;\n  kind: "pc" | "npc";',
    'export interface CampaignMapToken {\n  id: string;\n  kind: "pc" | "npc" | "companion";',
    "public token kind",
  ],
  [
    '  characters: CampaignMapCharacterOption[];\n  encounterAvailable?: boolean;',
    '  characters: CampaignMapCharacterOption[];\n  companions: CampaignMapCompanionOption[];\n  encounterAvailable?: boolean;',
    "response companion options",
  ],
  [
    'async function linkedCampaignCharacters(db: D1Database, campaignId: string): Promise<CampaignMapCharacterOption[]> {\n  const result = await db.prepare(`SELECT ch.public_id AS id, ch.name\n    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n    WHERE cc.campaign_id = ?\n    ORDER BY lower(ch.name), ch.public_id`)\n    .bind(campaignId).all<CampaignMapCharacterOption>();\n  return result.results;\n}\n',
    'async function linkedCampaignCharacters(db: D1Database, campaignId: string): Promise<CampaignMapCharacterOption[]> {\n  const result = await db.prepare(`SELECT ch.public_id AS id, ch.name\n    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n    WHERE cc.campaign_id = ?\n    ORDER BY lower(ch.name), ch.public_id`)\n    .bind(campaignId).all<CampaignMapCharacterOption>();\n  return result.results;\n}\n\ntype CampaignMapCompanionCharacterRow = { id: string; name: string; data: string };\n\nasync function linkedCampaignCompanions(db: D1Database, campaignId: string): Promise<CampaignMapCompanionOption[]> {\n  const result = await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data\n    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n    WHERE cc.campaign_id = ?\n    ORDER BY lower(ch.name), ch.public_id`)\n    .bind(campaignId).all<CampaignMapCompanionCharacterRow>();\n  return result.results.flatMap(character =>\n    campaignMapCompanionsFromCharacterData(character.id, character.name, character.data));\n}\n\nasync function actorOwnsActiveCompanionSource(\n  db: D1Database,\n  actor: CampaignActor,\n  campaignId: string,\n  sourceId: string,\n): Promise<boolean> {\n  const characterId = campaignMapCompanionCharacterId(sourceId);\n  if (!characterId) return false;\n  const character = await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data\n    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n    WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)\n    .bind(campaignId, characterId, actor.userId).first<CampaignMapCompanionCharacterRow>();\n  return Boolean(character && campaignMapCompanionsFromCharacterData(\n    character.id, character.name, character.data).some(companion => companion.id === sourceId));\n}\n',
    "companion projection helpers",
  ],
  [
    '  const ownedCharacterIds = access.canManage ? new Set<string>() : await ownCampaignCharacterIds(db, actor, access.campaignInternalId);\n  return result.results.map(token => ({\n',
    '  const ownedCharacterIds = access.canManage ? new Set<string>() : await ownCampaignCharacterIds(db, actor, access.campaignInternalId);\n  const ownedCompanionIds = access.canManage\n    ? new Set<string>()\n    : new Set((await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data\n        FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n        WHERE cc.campaign_id = ? AND ch.owner_user_id = ?`)\n      .bind(access.campaignInternalId, actor.userId).all<CampaignMapCompanionCharacterRow>()).results\n      .flatMap(character => campaignMapCompanionsFromCharacterData(character.id, character.name, character.data))\n      .map(companion => companion.id));\n  return result.results.map(token => ({\n',
    "owned companion ids",
  ],
  [
    '    canMove: access.canManage || (token.kind === "pc" && ownedCharacterIds.has(token.sourceId)),',
    '    canMove: access.canManage\n      || (token.kind === "pc" && ownedCharacterIds.has(token.sourceId))\n      || (token.kind === "companion" && ownedCompanionIds.has(token.sourceId)),',
    "companion movement projection",
  ],
  [
    '    characters: access.canManage ? await linkedCampaignCharacters(db, access.campaignInternalId) : [],\n  };',
    '    characters: access.canManage ? await linkedCampaignCharacters(db, access.campaignInternalId) : [],\n    companions: access.canManage ? await linkedCampaignCompanions(db, access.campaignInternalId) : [],\n  };',
    "companion response",
  ],
  [
    'export interface CampaignMapEncounterTokenSeed {\n',
    'export async function placeCampaignMapCompanionToken(\n  db: D1Database,\n  actor: CampaignActor,\n  publicId: string,\n  mapIdValue: unknown,\n  companionIdValue: unknown,\n  now = new Date().toISOString(),\n): Promise<CampaignMapPayload> {\n  const access = await loadCampaignMapAccess(db, actor, publicId);\n  requireMapManagement(access);\n  const row = requireMapBackground(await requireCampaignMap(db, access, mapIdValue));\n  const companionId = identifier(companionIdValue, "Companion");\n  const companion = (await linkedCampaignCompanions(db, access.campaignInternalId))\n    .find(option => option.id === companionId);\n  if (!companion) throw new CampaignServiceError("The active linked companion was not found.", 404);\n  const position = defaultTokenPosition(row, await tokenCount(db, row.id));\n  await db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens\n    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)\n    VALUES (?, ?, ?, \'companion\', ?, ?, ?, ?, 1, ?, ?)`)\n    .bind(`mpt_${crypto.randomUUID()}`, access.campaignInternalId, row.id, companion.id, companion.name, position.x, position.y, now, now).run();\n  return mapPayload(db, actor, access, row);\n}\n\nexport interface CampaignMapEncounterTokenSeed {\n',
    "companion placement service",
  ],
  [
    '  if (!canMove && token.kind === "pc") {\n    const own = await db.prepare(`SELECT 1 AS allowed\n      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n      WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)\n      .bind(access.campaignInternalId, token.sourceId, actor.userId).first<{ allowed: number }>();\n    canMove = Boolean(own);\n  }\n  if (!canMove) throw new CampaignServiceError("You can move only your own campaign character token.", 403);',
    '  if (!canMove && token.kind === "pc") {\n    const own = await db.prepare(`SELECT 1 AS allowed\n      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id\n      WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)\n      .bind(access.campaignInternalId, token.sourceId, actor.userId).first<{ allowed: number }>();\n    canMove = Boolean(own);\n  }\n  if (!canMove && token.kind === "companion") {\n    canMove = await actorOwnsActiveCompanionSource(db, actor, access.campaignInternalId, token.sourceId);\n  }\n  if (!canMove) throw new CampaignServiceError("You can move only your own campaign character or companion token.", 403);',
    "companion movement authorization",
  ],
]);

await transform("app/api/campaigns/[id]/map/tokens/route.ts", [
  [
    '  moveCampaignMapToken,\n  placeCampaignMapCharacterToken,',
    '  moveCampaignMapToken,\n  placeCampaignMapCharacterToken,\n  placeCampaignMapCompanionToken,',
    "companion placement import",
  ],
  [
    '    if (body.action === "place_pc") {\n      map = await placeCampaignMapCharacterToken(db, actor, id, body.mapId, body.characterId);\n    } else if (body.action === "place_encounter") {',
    '    if (body.action === "place_pc") {\n      map = await placeCampaignMapCharacterToken(db, actor, id, body.mapId, body.characterId);\n    } else if (body.action === "place_companion") {\n      map = await placeCampaignMapCompanionToken(db, actor, id, body.mapId, body.companionId);\n    } else if (body.action === "place_encounter") {',
    "companion placement action",
  ],
]);

await transform("app/campaigns/campaign-map-launcher.tsx", [
  [
    '  CampaignMapCharacterOption,\n  CampaignMapPayload,',
    '  CampaignMapCharacterOption,\n  CampaignMapCompanionOption,\n  CampaignMapPayload,',
    "companion option import",
  ],
  [
    '  characters?: CampaignMapCharacterOption[];\n  encounterAvailable?: boolean;',
    '  characters?: CampaignMapCharacterOption[];\n  companions?: CampaignMapCompanionOption[];\n  encounterAvailable?: boolean;',
    "companion response type",
  ],
  [
    'function tokenInitials(name: string): string {\n',
    'function tokenKindLabel(kind: CampaignMapToken["kind"]): string {\n  return kind === "pc" ? "PC" : kind === "companion" ? "Companion" : "NPC";\n}\n\nfunction tokenAriaKind(kind: CampaignMapToken["kind"]): string {\n  return kind === "pc" ? "player character" : kind === "companion" ? "companion" : "NPC";\n}\n\nfunction tokenInitials(name: string): string {\n',
    "token kind helpers",
  ],
  [
    '  const [characters, setCharacters] = useState<CampaignMapCharacterOption[]>([]);\n  const [encounterAvailable, setEncounterAvailable] = useState(false);',
    '  const [characters, setCharacters] = useState<CampaignMapCharacterOption[]>([]);\n  const [companions, setCompanions] = useState<CampaignMapCompanionOption[]>([]);\n  const [encounterAvailable, setEncounterAvailable] = useState(false);',
    "companion state",
  ],
  [
    '    if (body.characters) setCharacters(body.characters);\n    if (typeof body.encounterAvailable === "boolean") setEncounterAvailable(body.encounterAvailable);',
    '    if (body.characters) setCharacters(body.characters);\n    if (body.companions) setCompanions(body.companions);\n    if (typeof body.encounterAvailable === "boolean") setEncounterAvailable(body.encounterAvailable);',
    "companion response state",
  ],
  [
    '  const placedCharacterIds = new Set(map?.tokens.filter(token => token.kind === "pc").map(token => token.sourceId) ?? []);',
    '  const placedCharacterIds = new Set(map?.tokens.filter(token => token.kind === "pc").map(token => token.sourceId) ?? []);\n  const placedCompanionIds = new Set(map?.tokens.filter(token => token.kind === "companion").map(token => token.sourceId) ?? []);',
    "placed companion ids",
  ],
  [
    '                    aria-label={`${token.name} ${token.kind === "pc" ? "player character" : "NPC"} token, ${sizeCells} by ${sizeCells} grid cells${token.canMove ? ", draggable" : ""}`}',
    '                    aria-label={`${token.name} ${tokenAriaKind(token.kind)} token, ${sizeCells} by ${sizeCells} grid cells${token.canMove ? ", draggable" : ""}`}',
    "token aria kind",
  ],
  [
    '                {characters.length > 0 && <div className="campaign-map-character-tokens">\n                  {characters.map(character => <div key={character.id}><span>{character.name}</span>{placedCharacterIds.has(character.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl} onClick={() => void tokenAction({ action: "place_pc", characterId: character.id })}>Place</button>}</div>)}\n                </div>}\n                {map.tokens.length ? <div className="campaign-map-placed-tokens">',
    '                {characters.length > 0 && <div className="campaign-map-character-tokens">\n                  {characters.map(character => <div key={character.id}><span>{character.name}</span>{placedCharacterIds.has(character.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl} onClick={() => void tokenAction({ action: "place_pc", characterId: character.id })}>Place</button>}</div>)}\n                </div>}\n                {companions.length > 0 && <div className="campaign-map-character-tokens campaign-map-companion-tokens">\n                  {companions.map(companion => <div key={companion.id}><span><b>{companion.name}</b><small>{companion.characterName} · {companion.label}</small></span>{placedCompanionIds.has(companion.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl} onClick={() => void tokenAction({ action: "place_companion", companionId: companion.id })}>Place</button>}</div>)}\n                </div>}\n                {map.tokens.length ? <div className="campaign-map-placed-tokens">',
    "companion placement controls",
  ],
  [
    '<span><b>{token.name}</b><small>{token.kind === "pc" ? "PC" : "NPC"} · {sizeCells}×{sizeCells}</small></span>',
    '<span><b>{token.name}</b><small>{tokenKindLabel(token.kind)} · {sizeCells}×{sizeCells}</small></span>',
    "placed token kind label",
  ],
]);

await transform("app/campaigns/campaign-map.css", [
  [
    '.campaign-map-token-npc .campaign-map-token-disc {\n  fill: rgba(92, 34, 30, .96);\n  stroke: rgba(238, 160, 133, .95);\n}\n',
    '.campaign-map-token-npc .campaign-map-token-disc {\n  fill: rgba(92, 34, 30, .96);\n  stroke: rgba(238, 160, 133, .95);\n}\n\n.campaign-map-token-companion .campaign-map-token-disc {\n  fill: rgba(35, 83, 67, .96);\n  stroke: rgba(151, 224, 190, .96);\n}\n',
    "companion token style",
  ],
  [
    '.campaign-map-character-tokens span,\n.campaign-map-placed-tokens span {\n  min-width: 0;',
    '.campaign-map-character-tokens span,\n.campaign-map-placed-tokens span {\n  min-width: 0;',
    "character token span anchor",
  ],
  [
    '.campaign-map-placed-tokens span {\n  display: grid;\n}\n',
    '.campaign-map-character-tokens span,\n.campaign-map-placed-tokens span {\n  display: grid;\n}\n',
    "companion metadata layout",
  ],
]);

await transform("scripts/migrate-campaign-map-foundation.mjs", [
  [
    '  "0020_action_bundle_8_live_map_dice.sql",\n];',
    '  "0020_action_bundle_8_live_map_dice.sql",\n  "0021_action_bundle_9_companion_map_tokens.sql",\n];',
    "migration list",
  ],
  [
    'for (const column of ["id", "campaign_id", "map_id", "kind", "source_id", "x", "y", "version"]) {\n  if (!tokenColumns.has(column)) throw new Error(`campaign_map_tokens is missing ${column}.`);\n}\n',
    'for (const column of ["id", "campaign_id", "map_id", "kind", "source_id", "x", "y", "version"]) {\n  if (!tokenColumns.has(column)) throw new Error(`campaign_map_tokens is missing ${column}.`);\n}\nconst tokenTableSql = String(query("SELECT sql FROM sqlite_master WHERE type = \'table\' AND name = \'campaign_map_tokens\'")[0]?.sql ?? "");\nif (!tokenTableSql.includes("\'companion\'")) {\n  throw new Error("campaign_map_tokens does not permit companion token rows.");\n}\nconst invalidTokenKinds = query("SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE kind NOT IN (\'pc\', \'npc\', \'companion\')")[0]?.count ?? 0;\nif (Number(invalidTokenKinds) !== 0) {\n  throw new Error("campaign_map_tokens contains an unsupported token kind.");\n}\n',
    "companion schema verification",
  ],
]);

await transform(".github/workflows/migrate-campaign-map-foundation.yml", [
  [
    '      - "drizzle/0020_action_bundle_8_live_map_dice.sql"\n',
    '      - "drizzle/0020_action_bundle_8_live_map_dice.sql"\n      - "drizzle/0021_action_bundle_9_companion_map_tokens.sql"\n',
    "migration workflow path",
  ],
]);

await transform(".github/workflows/deploy-production.yml", [
  [
    '^drizzle/(0014_campaign_map_foundation|0015_campaign_map_interactions|0020_action_bundle_8_live_map_dice)\\.sql$',
    '^drizzle/(0014_campaign_map_foundation|0015_campaign_map_interactions|0020_action_bundle_8_live_map_dice|0021_action_bundle_9_companion_map_tokens)\\.sql$',
    "deployment migration guard",
  ],
]);
