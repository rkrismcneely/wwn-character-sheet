import { CANONICAL_ORIGIN } from "../auth-constants";

export const CAMPAIGN_JOIN_PATH = "/campaigns/join";

export function campaignInviteLink(token: string): string {
  const url = new URL(CAMPAIGN_JOIN_PATH, CANONICAL_ORIGIN);
  // Keep the bearer credential in the fragment so it is not sent in HTTP
  // requests, referrers, or normal server access logs.
  url.hash = token;
  return url.toString();
}
