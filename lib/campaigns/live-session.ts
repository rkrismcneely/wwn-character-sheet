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
  combatStats?: CampaignNpcCombatStats;
}

export interface CampaignNpcCombatStats {
  saves: { physical: number; evasion: number; mental: number };
  attacks: { name: string; attackBonus: number; damage: string; description: string }[];
  notes: string;
  sourceStats?: { hitDice: number; shock: string; move: string; morale: number; instinct: number; skill: number };
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
  return { ...encounter, combatants: encounter.combatants.map(combatant => combatant.kind === "pc" ? combatant : { id: combatant.id, kind: combatant.kind, name: combatant.name, initiative: combatant.initiative, hpCurrent: combatant.hpCurrent }) };
}

export type CampaignLiveSessionEvent =
  | { type: "session.presence"; sessionId: string; connectedParticipantKeys: string[] }
  | { type: "session.participants-changed"; sessionId: string }
  | { type: "session.character-status"; sessionId: string; participantKey: string; character: CampaignLiveSessionCharacter }
  | { type: "session.roll"; sessionId: string; roll: CampaignSharedRoll }
  | { type: "session.encounter"; sessionId: string }
  | { type: "session.ended"; sessionId: string };
