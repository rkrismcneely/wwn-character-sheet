export interface CampaignLiveSessionParticipant {
  participantKey: string;
  name: string;
  characterName: string | null;
  character: CampaignLiveSessionCharacter | null;
  joinedAt: string;
  connected: boolean;
}

export interface CampaignLiveSessionCharacter {
  id: string;
  name: string;
  level: number;
  classLabel: string;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
}

export interface CampaignLiveSession {
  id: string;
  startedAt: string;
  participants: CampaignLiveSessionParticipant[];
  recentRolls: CampaignSharedRoll[];
  encounter: CampaignEncounter | null;
}

export interface CampaignEncounterPc {
  id: string;
  kind: "pc";
  characterId: string;
  initiative: number;
}

export interface CampaignEncounterNpc {
  id: string;
  kind: "npc";
  name: string;
  initiative: number;
  hpCurrent: number;
  hpMax?: number;
  armorClass?: number;
  notes?: string;
  friendly?: boolean;
  combatStats?: CampaignNpcCombatStats;
}

export interface CampaignNpcCombatStats {
  saves: { physical: number; evasion: number; mental: number };
  attacks: import("./npc-combat.ts").CampaignNpcAttack[];
  spells: import("./npc-combat.ts").CampaignNpcMagicReference[];
  arts: import("./npc-combat.ts").CampaignNpcMagicReference[];
  /** Structured creature abilities kept near attacks in the encounter view. */
  abilities?: { name: string; summary: string }[];
  notes: string;
  threatStats?: import("./npc-combat.ts").CampaignNpcThreatStats;
  sourceStats?: { hitDice: number; hitDiceDisplay?: string; attacksPerMainAction?: number; attacksPerMainActionDisplay?: string; shock: string; move: string; morale: number; instinct: number; skill: number };
}

/**
 * Encounter snapshots can outlive the application version that created them.
 * Bundle 7 added structured magic fields, so keep older snapshots renderable
 * without changing their stored combat data.
 */
export function normalizeCampaignNpcCombatStats(value: unknown): CampaignNpcCombatStats | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!candidate.saves || !Array.isArray(candidate.attacks) || typeof candidate.notes !== "string") return undefined;
  const normalized = {
    ...candidate,
    spells: Array.isArray(candidate.spells) ? candidate.spells : [],
    arts: Array.isArray(candidate.arts) ? candidate.arts : [],
  } as Record<string, unknown>;
  if (Array.isArray(candidate.abilities)) {
    normalized.abilities = candidate.abilities
      .filter((ability): ability is { name: string; summary: string } => Boolean(ability && typeof ability === "object" && !Array.isArray(ability) && typeof (ability as Record<string, unknown>).name === "string" && typeof (ability as Record<string, unknown>).summary === "string"))
      .map(ability => ({ name: ability.name, summary: ability.summary }));
  } else {
    delete normalized.abilities;
  }
  return normalized as unknown as CampaignNpcCombatStats;
}

export type CampaignEncounterCombatant = CampaignEncounterPc | CampaignEncounterNpc;

export interface CampaignEncounter {
  id: string;
  round: number;
  currentCombatantId: string | null;
  combatants: CampaignEncounterCombatant[];
}

export interface CampaignSharedRoll {
  id: string;
  timestamp: string;
  category: "skill" | "attack" | "damage" | "save" | "initiative";
  character: { id: string; name: string };
  label: string;
  dice: { count: number; sides: number; results: number[]; total: number };
  modifiers: { label: string; value: number }[];
  modifierTotal: number;
  total: number;
  target?: number;
  outcome?: "success" | "failure";
}

export interface CampaignLiveSessionState {
  session: CampaignLiveSession | null;
  permissions: {
    canStart: boolean;
    canJoin: boolean;
    canEnd: boolean;
    canManageEncounter: boolean;
    joined: boolean;
    adminReadOnly: boolean;
  };
}

export function memberEncounterProjection(encounter: CampaignEncounter | null): CampaignEncounter | null {
  if (!encounter) return null;
  return { ...encounter, combatants: encounter.combatants.map(combatant => combatant.kind === "pc" ? combatant : { id: combatant.id, kind: combatant.kind, name: combatant.name, initiative: combatant.initiative, hpCurrent: combatant.hpCurrent, friendly: combatant.friendly }) };
}

export type CampaignLiveSessionEvent =
  | { type: "session.presence"; sessionId: string; connectedParticipantKeys: string[] }
  | { type: "session.participants-changed"; sessionId: string }
  | { type: "session.character-status"; sessionId: string; participantKey: string; character: CampaignLiveSessionCharacter }
  | { type: "session.roll"; sessionId: string; roll: CampaignSharedRoll }
  | { type: "session.encounter"; sessionId: string }
  | { type: "session.map-changed"; sessionId: string }
  | { type: "session.ended"; sessionId: string };
