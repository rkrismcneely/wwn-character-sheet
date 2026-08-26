import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { authorizeEncounterCharacter, authorizeEncounterManagement } from "@/lib/campaigns/live-session-service";
import { CampaignServiceError, getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) throw new CampaignServiceError(`${label} is invalid.`, 422);
  return text;
}

function optionalText(value: unknown, label: string, maximum: number): string {
  if (value === undefined || value === null || value === "") return "";
  return boundedText(value, label, maximum);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return value as number;
}

function combatantId(value: unknown): string { return boundedText(value, "Combatant", 100); }

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    const { id } = await context.params;
    const db = await getCampaignD1();
    const authorization = await authorizeEncounterManagement(db, actor, id);
    const durable = env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${authorization.campaignId}`);
    let encounter;

    if (body.action === "start") encounter = await durable.startEncounter(authorization.sessionId);
    else {
      if (!(await durable.encounter(authorization.sessionId))) throw new CampaignServiceError("There is no active encounter.", 409);
      if (body.action === "add_pc") {
        const characterId = boundedText(body.characterId, "Character", 100);
        const character = await authorizeEncounterCharacter(db, authorization.campaignId, authorization.sessionId, characterId);
        encounter = await durable.addPc(authorization.sessionId, character.id);
      } else if (body.action === "add_npc") {
        const hpMax = integer(body.hpMax, "Maximum HP", 1, 100000);
        encounter = await durable.addNpc(authorization.sessionId, {
          name: boundedText(body.name, "NPC name", 80),
          initiative: integer(body.initiative, "Initiative", -1000, 1000),
          hpCurrent: integer(body.hpCurrent, "Current HP", 0, hpMax),
          hpMax,
          armorClass: integer(body.armorClass, "Armor Class", 0, 1000),
          notes: optionalText(body.notes, "Notes", 240),
        });
      } else if (body.action === "initiative") {
        encounter = await durable.setInitiative(authorization.sessionId, combatantId(body.combatantId), integer(body.initiative, "Initiative", -1000, 1000));
      } else if (body.action === "npc_hp") {
        encounter = await durable.setNpcHp(authorization.sessionId, combatantId(body.combatantId), integer(body.hpCurrent, "Current HP", 0, 100000));
      } else if (body.action === "remove") {
        encounter = await durable.removeCombatant(authorization.sessionId, combatantId(body.combatantId));
      } else if (body.action === "next" || body.action === "previous") {
        encounter = await durable.moveTurn(authorization.sessionId, body.action);
      } else if (body.action === "end") encounter = await durable.endEncounter(authorization.sessionId);
      else throw new CampaignServiceError("A valid encounter action is required.", 422);
    }
    return Response.json({ encounter });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The encounter could not be updated.");
  }
}
