export interface CampaignLiveSessionParticipant {
  participantKey: string;
  name: string;
  characterName: string | null;
  joinedAt: string;
  connected: boolean;
}

export interface CampaignLiveSession {
  id: string;
  startedAt: string;
  participants: CampaignLiveSessionParticipant[];
  recentRolls: CampaignSharedRoll[];
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
    joined: boolean;
    adminReadOnly: boolean;
  };
}

export type CampaignLiveSessionEvent =
  | { type: "session.presence"; sessionId: string; connectedParticipantKeys: string[] }
  | { type: "session.participants-changed"; sessionId: string }
  | { type: "session.roll"; sessionId: string; roll: CampaignSharedRoll }
  | { type: "session.ended"; sessionId: string };
