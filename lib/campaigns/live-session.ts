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
}

export interface CampaignLiveSessionState {
  session: CampaignLiveSession | null;
  permissions: {
    canStart: boolean;
    canJoin: boolean;
    canEnd: boolean;
    adminReadOnly: boolean;
  };
}

export type CampaignLiveSessionEvent =
  | { type: "session.presence"; sessionId: string; connectedParticipantKeys: string[] }
  | { type: "session.participants-changed"; sessionId: string }
  | { type: "session.ended"; sessionId: string };
