import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { authorizeEncounterCharacter, authorizeEncounterManagement } from "@/lib/campaigns/live-session-service";
import { campaignNpcEncounterSeed } from "@/lib/campaigns/npcs";
import { normalizeNpcAttacks, normalizeNpcMagicReferences, normalizeNpcThreatStats } from "@/lib/campaigns/npc-combat";
import { getPreparedEncounter } from "@/lib/campaigns/prepared-encounters";
import { listCampaignCharacters } from "@/lib/campaigns/characters";
import { builtInBestiaryEncounterSeed } from "@/lib/campaigns/bestiary";
import type { CampaignNpcCombatStats } from "@/lib/campaigns/live-session";
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

/** Only mutable encounter snapshot fields are accepted; provenance and saves stay intact. */
function updatedNpcCombatStats(value: unknown, existing: CampaignNpcCombatStats): CampaignNpcCombatStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CampaignServiceError("Combat data is invalid.", 422);
  const candidate = value as Record<string, unknown>;
  const threatStats = candidate.threatStats === undefined ? existing.threatStats : normalizeNpcThreatStats(candidate.threatStats) ?? undefined;
  return {
    ...existing,
    attacks: normalizeNpcAttacks(candidate.attacks, existing.attacks),
    spells: candidate.spells === undefined ? existing.spells : normalizeNpcMagicReferences(candidate.spells, "Spells"),
    arts: candidate.arts === undefined ? existing.arts : normalizeNpcMagicReferences(candidate.arts, "Arts"),
    ...(threatStats ? { threatStats } : { threatStats: undefined }),
  };
}

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

    if (body.action === "deploy_prepared") {
      if (await durable.encounter(authorization.sessionId)) throw new CampaignServiceError("End the current encounter before deploying another.", 409);
      if (typeof body.preparedId !== "string") throw new CampaignServiceError("Choose a prepared encounter.", 422);
      const plan = await getPreparedEncounter(db, actor, id, body.preparedId);
      // Validate all referenced templates before starting to avoid partial deployments from missing records.
      const seeds = [];
      const partyIds = new Set<string>();
      const linkedParty = plan.entries.some(entry => entry.kind === "party" && entry.characterId === "all")
        ? await listCampaignCharacters(db, actor, id) : [];
      for (const entry of plan.entries) {
        if (entry.kind === "party") {
          if (entry.characterId === "all") {
            for (const character of linkedParty) partyIds.add(character.id);
          } else {
            partyIds.add(entry.characterId);
          }
          continue;
        }
        const seed = entry.kind === "saved"
          ? await campaignNpcEncounterSeed(db, authorization.campaignId, entry.npcId)
          : builtInBestiaryEncounterSeed(entry.bestiaryId);
        if (!seed) throw new CampaignServiceError("A creature in this plan is no longer available.", 422);
        for (let count = 0; count < entry.quantity; count++) seeds.push(seed);
      }
      const characters = [];
      for (const characterId of partyIds) {
        characters.push(await authorizeEncounterCharacter(db, authorization.campaignId, authorization.sessionId, characterId));
      }
      encounter = await durable.startEncounter(authorization.sessionId);
      for (const character of characters) encounter = await durable.addPc(authorization.sessionId, character.id, character.alertPriority);
      for (const seed of seeds) encounter = await durable.addNpc(authorization.sessionId, seed);
    }
    else if (body.action === "start") encounter = await durable.startEncounter(authorization.sessionId);
    else {
      if (!(await durable.encounter(authorization.sessionId))) throw new CampaignServiceError("There is no active encounter.", 409);
      if (body.action === "add_pc") {
        const characterId = boundedText(body.characterId, "Character", 100);
        const character = await authorizeEncounterCharacter(db, authorization.campaignId, authorization.sessionId, characterId);
        encounter = await durable.addPc(authorization.sessionId, character.id, character.alertPriority);
      } else if (body.action === "add_npc") {
        const hpMax = integer(body.hpMax, "Maximum HP", 1, 100000);
        encounter = await durable.addNpc(authorization.sessionId, {
          name: boundedText(body.name, "NPC name", 80),
          initiative: integer(body.initiative, "Initiative", -1000, 1000),
          hpCurrent: integer(body.hpCurrent, "Current HP", 0, hpMax),
          hpMax,
          armorClass: integer(body.armorClass, "Armor Class", 0, 1000),
          notes: optionalText(body.notes, "Notes", 240),
          friendly: body.friendly === true,
        });
      } else if (body.action === "add_saved_npc") {
        const seed = await campaignNpcEncounterSeed(db, authorization.campaignId, boundedText(body.npcId, "NPC template", 100));
        encounter = await durable.addNpc(authorization.sessionId, seed);
      } else if (body.action === "add_bestiary_npc") {
        const seed = builtInBestiaryEncounterSeed(boundedText(body.bestiaryId, "Built-in creature", 100));
        if (!seed) throw new CampaignServiceError("Built-in creature not found.", 404);
        encounter = await durable.addNpc(authorization.sessionId, seed);
      } else if (body.action === "alert_priority") {
        if (typeof body.enabled !== "boolean") throw new CampaignServiceError("Alert priority is invalid.", 422);
        encounter = await durable.setAlertPriority(authorization.sessionId, combatantId(body.combatantId), body.enabled);
      } else if (body.action === "initiative") {
        encounter = await durable.setInitiative(authorization.sessionId, combatantId(body.combatantId), integer(body.initiative, "Initiative", -1000, 1000));
      } else if (body.action === "npc_hp") {
        encounter = await durable.setNpcHp(authorization.sessionId, combatantId(body.combatantId), integer(body.hpCurrent, "Current HP", 0, 100000));
      } else if (body.action === "npc_friendly") {
        encounter = await durable.setNpcFriendly(authorization.sessionId, combatantId(body.combatantId), body.friendly === true);
      } else if (body.action === "npc_combat") {
        const existing = await durable.encounter(authorization.sessionId);
        const candidate = existing?.combatants.find(combatant => combatant.id === combatantId(body.combatantId));
        if (!candidate || candidate.kind !== "npc") throw new CampaignServiceError("NPC combat data was not found.", 404);
        const combatStats = candidate.combatStats;
        if (!combatStats) throw new CampaignServiceError("NPC combat data was not found.", 404);
        encounter = await durable.setNpcCombatStats(authorization.sessionId, candidate.id, updatedNpcCombatStats(body.combatStats, combatStats));
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
