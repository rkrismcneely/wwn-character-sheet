import {readDeployedEncounterMapLayout} from "@/lib/campaigns/prepared-encounters";
import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { snapCampaignMapTokenMove } from "@/lib/campaigns/map-interactions";
import {
  loadCampaignMapAccess,
  moveCampaignMapToken,
  placeCampaignMapCharacterToken,
  placeCampaignMapCompanionToken,
  placeCampaignMapEncounterTokens,
  removeCampaignMapToken,
  type CampaignMapEncounterTokenSeed,
} from "@/lib/campaigns/map";
import { CampaignServiceError, getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

async function activeSessionId(db: D1Database, campaignId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL")
    .bind(campaignId).first<{ id: string }>();
  return row?.id ?? null;
}

async function announceMapChanged(db: D1Database, campaignId: string): Promise<void> {
  const sessionId = await activeSessionId(db, campaignId);
  if (!sessionId) return;
  try {
    await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).announceMapChanged(sessionId);
  } catch (error) {
    console.error("Campaign map realtime notification failed", error);
  }
}

async function encounterSeeds(db: D1Database, campaignId: string, mapId: unknown): Promise<CampaignMapEncounterTokenSeed[]> {
  const sessionId = await activeSessionId(db, campaignId);
  if (!sessionId) throw new CampaignServiceError("Start a live session before placing an encounter on the map.", 409);
  const encounter = await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).encounter(sessionId);
  if (!encounter) throw new CampaignServiceError("Start an encounter before placing it on the map.", 409);
  const characters = await db.prepare(`SELECT ch.public_id AS id, ch.name
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ?`).bind(campaignId).all<{ id: string; name: string }>();
  const characterNames = new Map(characters.results.map(character => [character.id, character.name]));
  const seeds: CampaignMapEncounterTokenSeed[] = [];
  for (const combatant of encounter.combatants) {
    if (combatant.kind === "npc") {
      seeds.push({ kind: "npc", sourceId: combatant.id, name: combatant.name });
      continue;
    }
    const name = characterNames.get(combatant.characterId);
    if (name) seeds.push({ kind: "pc", sourceId: combatant.characterId, name });
  }
  const layout=await readDeployedEncounterMapLayout(db,campaignId,encounter.id);
  if(layout && layout.mapId === mapId){
    const remaining=[...layout.positions];
    for(const seed of seeds){
      const index=remaining.findIndex(position=>position.kind===seed.kind && position.name===seed.name);
      if(index>=0){
        const [position]=remaining.splice(index,1);
        seed.position={x:position.x,y:position.y};
      }
    }
  }
  return seeds;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    const { id } = await context.params;
    const db = await getCampaignD1();
    const access = await loadCampaignMapAccess(db, actor, id);
    let map;

    if (body.action === "place_pc") {
      map = await placeCampaignMapCharacterToken(db, actor, id, body.mapId, body.characterId);
    } else if (body.action === "place_companion") {
      map = await placeCampaignMapCompanionToken(db, actor, id, body.mapId, body.companionId);
    } else if (body.action === "place_encounter") {
      if (!access.canManage) throw new CampaignServiceError("Not permitted.", 403);
      map = await placeCampaignMapEncounterTokens(db, actor, id, body.mapId, await encounterSeeds(db, access.campaignInternalId, body.mapId));
    } else if (body.action === "move") {
      map = await moveCampaignMapToken(db, actor, id, await snapCampaignMapTokenMove(db, actor, id, body));
    } else if (body.action === "remove") {
      map = await removeCampaignMapToken(db, actor, id, body.mapId, body.tokenId);
    } else {
      throw new CampaignServiceError("A valid map-token action is required.", 422);
    }

    if (map.isActive) await announceMapChanged(db, access.campaignInternalId);
    return Response.json({ map }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The campaign map token could not be updated.");
  }
}
