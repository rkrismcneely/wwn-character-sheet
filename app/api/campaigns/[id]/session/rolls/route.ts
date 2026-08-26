import { env } from "cloudflare:workers";
import { resolveRoll } from "@/app/rolls";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { CampaignServiceError } from "@/lib/campaigns/service";
import { authorizeEncounterManagement, authorizeLiveSessionRoll } from "@/lib/campaigns/live-session-service";
import { normalizeSharedRollRequest, npcRollRequest, toCampaignSharedRoll, toPublicNpcCampaignSharedRoll, type NpcRollAction } from "@/lib/campaigns/shared-roll";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

function sessionObjectName(campaignId: string): string { return `campaign:${campaignId}`; }

function normalizeNpcRollAction(value: unknown): NpcRollAction {
  if (!value || typeof value !== "object") throw new CampaignServiceError("A valid NPC roll action is required.", 422);
  const candidate = value as { kind?: unknown; attackIndex?: unknown; save?: unknown };
  if ((candidate.kind === "attack" || candidate.kind === "damage") && Number.isInteger(candidate.attackIndex) && (candidate.attackIndex as number) >= 0 && (candidate.attackIndex as number) < 8) {
    return { kind: candidate.kind, attackIndex: candidate.attackIndex as number };
  }
  if (candidate.kind === "save" && (candidate.save === "physical" || candidate.save === "evasion" || candidate.save === "mental")) return { kind: "save", save: candidate.save };
  throw new CampaignServiceError("A valid NPC roll action is required.", 422);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const body = await readBoundedJson(request, 16 * 1024) as { action?: unknown; characterId?: unknown; request?: unknown; rollId?: unknown; combatantId?: unknown; npcAction?: unknown };
    const { id } = await context.params;
    const db = await getCampaignD1();

    if (body.action === "npc_prepare" || body.action === "npc_publish") {
      const authorization = await authorizeEncounterManagement(db, actor, id);
      const durable = env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(authorization.campaignId));
      if (body.action === "npc_prepare") {
        if (typeof body.combatantId !== "string" || body.combatantId.length > 100) return Response.json({ error: "A valid encounter NPC is required." }, { status: 422 });
        const encounter = await durable.encounter(authorization.sessionId);
        const npcs = encounter?.combatants.filter(candidate => candidate.kind === "npc") ?? [];
        const combatant = npcs.find(candidate => candidate.id === body.combatantId);
        const ordinal = combatant ? npcs.filter(candidate => candidate.name === combatant.name).findIndex(candidate => candidate.id === combatant.id) : -1;
        const sameNamedCount = combatant ? npcs.filter(candidate => candidate.name === combatant.name).length : 0;
        const rollNpc = combatant && sameNamedCount > 1 ? { ...combatant, name: `${combatant.name} #${ordinal + 1}` } : combatant;
        const rollRequest = rollNpc ? npcRollRequest(rollNpc, normalizeNpcRollAction(body.npcAction)) : null;
        if (!rollRequest) return Response.json({ error: "That NPC does not have enough saved combat data for this roll." }, { status: 422 });
        const roll = await resolveRoll(rollRequest);
        await durable.prepareRoll(authorization.sessionId, authorization.participantKey, toPublicNpcCampaignSharedRoll(roll));
        return Response.json({ roll }, { status: 201 });
      }
      if (typeof body.rollId !== "string" || body.rollId.length > 100) return Response.json({ error: "A valid roll is required." }, { status: 422 });
      const roll = await durable.publishRoll(authorization.sessionId, authorization.participantKey, body.rollId);
      return Response.json({ roll });
    }

    if (typeof body.characterId !== "string") return Response.json({ error: "A valid character is required." }, { status: 422 });
    const authorization = await authorizeLiveSessionRoll(db, actor, id, body.characterId);
    const durable = env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(authorization.campaignId));

    if (body.action === "prepare") {
      const rollRequest = normalizeSharedRollRequest(body.request, authorization.character);
      const roll = toCampaignSharedRoll(await resolveRoll(rollRequest));
      await durable.prepareRoll(authorization.sessionId, authorization.participantKey, roll);
      return Response.json({ roll }, { status: 201 });
    }
    if (body.action === "publish" && typeof body.rollId === "string" && body.rollId.length <= 100) {
      const roll = await durable.publishRoll(authorization.sessionId, authorization.participantKey, body.rollId);
      return Response.json({ roll });
    }
    return Response.json({ error: "A valid shared-roll action is required." }, { status: 422 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The roll could not be shared.");
  }
}
